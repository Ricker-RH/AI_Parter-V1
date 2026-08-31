import { randomUUID } from "node:crypto";
import type {
  CreatorDraftInput,
  CreatorReferenceRole,
} from "@aifans/contracts";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Pool, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  createCreatorRepository,
  createPlatformCreatorRepository,
} from "../src/creator.js";
import { createActorSession, createPlatformSession } from "../src/session.js";
import {
  creatorDrafts,
  creatorIpRequests,
  creatorSubmissions,
  ipProfiles,
} from "../src/schema.js";

const connectionString =
  process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "";
const integration = connectionString ? describe : describe.skip;
const pool = new Pool({ connectionString });

const input = (suffix = "", targetIpProfileId?: string): CreatorDraftInput => ({
  ...(targetIpProfileId ? { targetIpProfileId } : {}),
  username: `creator_${suffix || randomUUID().replaceAll("-", "").slice(0, 12)}`,
  displayName: `Creator ${suffix || "IP"}`,
  shortDescription: "A safe short description.",
  languageCodes: ["en", "zh-CN"],
  contentThemes: ["technology", "design"],
  persona: {
    personality: "Curious and thoughtful",
    background: "A fictional independent researcher.",
    world: "Contemporary Kuala Lumpur.",
    values: "Accuracy, kindness, and curiosity.",
    tone: "Warm and concise.",
    interests: ["technology", "design"],
    boundaries: "Does not give professional medical advice.",
    relationshipStyle: "A collaborative guide.",
  },
  visualType: "hybrid",
  appearance: "A consistent semi-realistic illustrated identity.",
});

async function human(client: PoolClient, prefix = "human") {
  const id = randomUUID();
  const subject = `auth_${randomUUID()}`;
  await client.query(
    "INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name,creator_mode_enabled) VALUES($1,$2,'human',$3,$4,true)",
    [
      id,
      subject,
      `${prefix.slice(0, 10)}_${id.replaceAll("-", "").slice(0, 18)}`,
      prefix,
    ],
  );
  return { id, subject };
}

async function operator(client: PoolClient) {
  const actor = await human(client, "operator");
  await client.query(
    "INSERT INTO public.profile_roles(profile_id,role,granted_by_profile_id) VALUES($1,'operator',$1)",
    [actor.id],
  );
  return actor;
}

async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    return await callback(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

function repositories(client: PoolClient) {
  const queryClient = { query: client.query.bind(client), release() {} };
  const actorSession = createActorSession(
    { connect: async () => queryClient },
    { transactionMode: "nested" },
  );
  const platformSession = createPlatformSession(
    { connect: async () => queryClient },
    { transactionMode: "nested" },
  );
  return {
    creator: createCreatorRepository({ withActor: actorSession.withActor }),
    platform: createPlatformCreatorRepository({
      withPlatformActor: platformSession.withPlatformActor,
    }),
  };
}

async function completeReferences(
  creator: ReturnType<typeof createCreatorRepository>,
  actor: { subject: string },
  draftId: string,
) {
  const roles: CreatorReferenceRole[] = [
    "avatar",
    "cover",
    "portrait",
    "full_body",
    "supporting_1",
  ];
  const selections = [];
  for (const role of roles) {
    const assetId = randomUUID();
    await creator.registerReference(actor, draftId, {
      id: assetId,
      contentType: "image/png",
      width: 1024,
      height: 1024,
    });
    selections.push({ assetId, role });
  }
  return selections;
}

async function createApprovedIp(client: PoolClient, requireApproval = false) {
  await client.query(
    "UPDATE public.platform_settings SET creator_ip_requires_approval=$1",
    [requireApproval],
  );
  const creatorActor = await human(client);
  const platformActor = await operator(client);
  const repos = repositories(client);
  const draft = await repos.creator.createDraft(creatorActor, input());
  const references = await completeReferences(
    repos.creator,
    creatorActor,
    draft.id,
  );
  const submission = await repos.creator.submitDraft(
    creatorActor,
    {
      draftId: draft.id,
      authorizationVersion: "creator-terms-2026-09-01",
      references,
    },
    { requestId: randomUUID() },
  );
  const approved =
    submission.state === "approved"
      ? submission
      : await repos.platform.decideSubmission({
          actor: platformActor,
          submissionId: submission.id,
          decision: "approve",
          requestId: randomUUID(),
        });
  if (!approved.ipProfileId)
    throw new Error("fixture approval did not create IP");
  return {
    creatorActor,
    platformActor,
    repos,
    submission: approved,
    ipProfileId: approved.ipProfileId,
  };
}

async function seedMixedCreatorHistory(
  client: PoolClient,
  creatorProfileId: string,
  count = 120,
) {
  const draftIds = Array.from({ length: count }, () => randomUUID());
  const revisionIds = Array.from({ length: count }, () => randomUUID());
  const submissionIds = Array.from({ length: count }, () => randomUUID());
  const ipProfileIds = Array.from({ length: count }, () => randomUUID());
  const requestIds = Array.from({ length: count }, () => randomUUID());
  await client.query(
    `INSERT INTO public.creator_drafts(
      id,creator_profile_id,state,username,display_name,short_description,language_codes,content_themes,
      personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance,created_at
    ) SELECT id,$1,'submitted','history_ip','History IP','history',ARRAY['en'],ARRAY['history'],
      'personality','background','world','values','tone',ARRAY[]::text[],'boundaries','relationship','hybrid','appearance',
      clock_timestamp()-(ordinality||' minutes')::interval
    FROM unnest($2::uuid[]) WITH ORDINALITY seeded(id,ordinality)`,
    [creatorProfileId, draftIds],
  );
  await client.query(
    `INSERT INTO public.creator_revisions(
      id,draft_id,creator_profile_id,version,username,display_name,short_description,language_codes,content_themes,
      personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance,created_at
    ) SELECT revision_id,draft_id,$1,1,'history_ip','History IP','history',ARRAY['en'],ARRAY['history'],
      'personality','background','world','values','tone',ARRAY[]::text[],'boundaries','relationship','hybrid','appearance',
      clock_timestamp()-(ordinality||' minutes')::interval
    FROM unnest($2::uuid[],$3::uuid[]) WITH ORDINALITY seeded(draft_id,revision_id,ordinality)`,
    [creatorProfileId, draftIds, revisionIds],
  );
  await client.query(
    `INSERT INTO public.creator_reference_assets(
      id,draft_id,creator_profile_id,object_key,content_type,width,height,draft_role
    ) SELECT gen_random_uuid(),draft_id,$1,
      'private/creator/history/'||draft_id::text||'/'||role::text||'.png','image/png',1024,1024,role
    FROM unnest($2::uuid[]) seeded(draft_id)
    CROSS JOIN unnest(ARRAY['avatar','cover','portrait','full_body','supporting_1']::public.creator_reference_role[]) roles(role)`,
    [creatorProfileId, draftIds],
  );
  await client.query(
    `INSERT INTO public.creator_revision_references(revision_id,asset_id,draft_id,role)
     SELECT r.id,a.id,a.draft_id,a.draft_role
     FROM public.creator_revisions r JOIN public.creator_reference_assets a ON a.draft_id=r.draft_id
     WHERE r.id=ANY($1::uuid[])`,
    [revisionIds],
  );
  await client.query(
    `INSERT INTO public.creator_submissions(
      id,draft_id,revision_id,creator_profile_id,state,submitted_at,decided_at,decision_reason
    ) SELECT submission_id,draft_id,revision_id,$1,
      CASE WHEN ordinality<=60 THEN 'rejected'::public.creator_submission_state ELSE 'pending_review'::public.creator_submission_state END,
      clock_timestamp()-(ordinality||' minutes')::interval,
      CASE WHEN ordinality<=60 THEN clock_timestamp() ELSE NULL END,
      CASE WHEN ordinality<=60 THEN 'historical rejection' ELSE NULL END
    FROM unnest($2::uuid[],$3::uuid[],$4::uuid[]) WITH ORDINALITY seeded(submission_id,draft_id,revision_id,ordinality)`,
    [creatorProfileId, submissionIds, draftIds, revisionIds],
  );
  await client.query(
    `INSERT INTO public.profiles(id,account_kind,username,display_name)
     SELECT id,'ip','history_'||left(replace(id::text,'-',''),18),'History IP' FROM unnest($1::uuid[]) seeded(id)`,
    [ipProfileIds],
  );
  await client.query(
    `INSERT INTO public.ip_profiles(profile_id,source,creator_profile_id,public_state,operation_enabled,created_at)
     SELECT id,'creator',$1,'approved',false,clock_timestamp()-(ordinality||' minutes')::interval
     FROM unnest($2::uuid[]) WITH ORDINALITY seeded(id,ordinality)`,
    [creatorProfileId, ipProfileIds],
  );
  await client.query(
    `INSERT INTO public.creator_ip_requests(
      id,ip_profile_id,creator_profile_id,kind,reason,state,created_at,decided_at,decision_reason
    ) SELECT request_id,ip_profile_id,$1,'unpublish','Mixed platform history request.',
      CASE WHEN ordinality<=60 THEN 'approved'::public.creator_request_state ELSE 'pending'::public.creator_request_state END,
      clock_timestamp()-(ordinality||' minutes')::interval,
      CASE WHEN ordinality<=60 THEN clock_timestamp() ELSE NULL END,NULL
    FROM unnest($2::uuid[],$3::uuid[]) WITH ORDINALITY seeded(request_id,ip_profile_id,ordinality)`,
    [creatorProfileId, requestIds, ipProfileIds],
  );
}

afterAll(async () => pool.end());

integration("creator mode database lifecycle", () => {
  it("keeps Drizzle parity for active revision constraints and cursor queue indexes", () => {
    expect(
      getTableConfig(ipProfiles).foreignKeys.map((key) => key.getName()),
    ).toContain("ip_profiles_active_creator_revision_fk");
    expect(
      getTableConfig(ipProfiles).indexes.map((index) => index.config.name),
    ).toContain("creator_ips_owner_cursor_idx");
    expect(
      getTableConfig(creatorDrafts).indexes.map((index) => index.config.name),
    ).toContain("creator_drafts_owner_cursor_idx");
    expect(
      getTableConfig(creatorSubmissions).indexes.map(
        (index) => index.config.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "creator_submissions_owner_cursor_idx",
        "creator_submissions_pending_cursor_idx",
      ]),
    );
    expect(
      getTableConfig(creatorIpRequests).indexes.map(
        (index) => index.config.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "creator_ip_requests_owner_cursor_idx",
        "creator_ip_requests_pending_cursor_idx",
        "creator_ip_requests_one_pending_idx",
      ]),
    );
  });

  it("keeps raw creator tables revoked with RLS and exposes only bounded role-specific functions", async () =>
    transaction(async (client) => {
      const tables = [
        "creator_quotas",
        "creator_drafts",
        "creator_reference_assets",
        "creator_revisions",
        "creator_revision_references",
        "creator_ip_revisions",
        "operating_authorization_acceptances",
        "creator_submissions",
        "creator_submission_decisions",
        "creator_ip_requests",
        "creator_request_decisions",
      ];
      const rls = await client.query<{
        relname: string;
        relrowsecurity: boolean;
      }>(
        "SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2::text[])",
        ["public", tables],
      );
      expect(rls.rows).toHaveLength(tables.length);
      expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);

      const privileges = await client.query<{
        authenticated_raw: boolean;
        platform_raw: boolean;
        authenticated_creator: boolean;
        authenticated_platform: boolean;
        platform_creator: boolean;
        platform_decision: boolean;
      }>(`SELECT
      has_table_privilege('aifans_authenticated','public.creator_drafts','SELECT,INSERT,UPDATE,DELETE') authenticated_raw,
      has_table_privilege('aifans_platform','public.creator_drafts','SELECT,INSERT,UPDATE,DELETE') platform_raw,
      has_function_privilege('aifans_authenticated','public.creator_create_draft(uuid,text,text,text,text[],text[],text,text,text,text,text,text[],text,text,creator_visual_type,text)','EXECUTE') authenticated_creator,
      has_function_privilege('aifans_authenticated','public.platform_decide_creator_submission(uuid,creator_decision_value,text,uuid)','EXECUTE') authenticated_platform,
      has_function_privilege('aifans_platform','public.creator_submit_draft(uuid,text,uuid[],creator_reference_role[],uuid)','EXECUTE') platform_creator,
      has_function_privilege('aifans_platform','public.platform_decide_creator_submission(uuid,creator_decision_value,text,uuid)','EXECUTE') platform_decision`);
      expect(privileges.rows[0]).toEqual({
        authenticated_raw: false,
        platform_raw: false,
        authenticated_creator: true,
        authenticated_platform: false,
        platform_creator: false,
        platform_decision: true,
      });
    }));

  it("supports isolated own-draft CRUD through actor-derived bounded commands", async () =>
    transaction(async (client) => {
      const first = await human(client, "first");
      const second = await human(client, "second");
      const { creator } = repositories(client);
      const created = await creator.createDraft(first, input("first"));
      expect(created).toMatchObject({
        status: "draft",
        displayName: "Creator first",
        references: [],
      });
      expect(await creator.getDraft(first, created.id)).toMatchObject({
        id: created.id,
      });
      await expect(creator.getDraft(second, created.id)).resolves.toBeNull();
      await expect(
        creator.updateDraft(second, created.id, input("stolen")),
      ).rejects.toThrow();
      const updated = await creator.updateDraft(first, created.id, {
        ...input("first"),
        displayName: "Updated",
      });
      expect(updated.displayName).toBe("Updated");
      await expect(creator.listDrafts(second, { limit: 10 })).resolves.toEqual({
        items: [],
        nextCursor: null,
      });
      await expect(creator.deleteDraft(first, created.id)).resolves.toEqual({
        deleted: true,
      });
      await expect(creator.deleteDraft(first, created.id)).resolves.toEqual({
        deleted: false,
      });
      await creator.createDraft(first, input("cursorone"));
      await creator.createDraft(first, input("cursortwo"));
      const firstPage = await creator.listDrafts(first, { limit: 1 });
      expect(firstPage.nextCursor).not.toBeNull();
      await creator.deleteDraft(first, firstPage.items[0]!.id);
      const secondPage = await creator.listDrafts(first, {
        limit: 1,
        cursor: firstPage.nextCursor!,
      });
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id);
    }));

  it("bounds nullable SQL page limits and filters platform queues before pagination", async () =>
    transaction(async (client) => {
      const creatorActor = await human(client, "mixedhistory");
      const platformActor = await operator(client);
      await seedMixedCreatorHistory(client, creatorActor.id);

      await client.query("SET LOCAL ROLE aifans_authenticated");
      await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: creatorActor.subject }),
      ]);
      for (const functionName of [
        "creator_list_drafts",
        "creator_list_submissions",
        "creator_list_requests",
        "creator_list_ips",
      ]) {
        const result = await client.query<{ count: number }>(
          `SELECT count(*)::integer count FROM public.${functionName}(NULL,NULL,NULL)`,
        );
        expect(result.rows[0]?.count).toBe(51);
      }
      await client.query("RESET ROLE");

      await client.query("SET LOCAL ROLE aifans_platform");
      await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: platformActor.subject }),
      ]);
      const submissions = await client.query<{
        count: number;
        all_pending: boolean;
      }>(
        `SELECT count(*)::integer count,bool_and(value->>'state'='pending_review') all_pending
         FROM public.platform_list_creator_submissions(NULL,NULL,NULL)`,
      );
      expect(submissions.rows[0]).toEqual({ count: 51, all_pending: true });
      const requests = await client.query<{
        count: number;
        all_pending: boolean;
      }>(
        `SELECT count(*)::integer count,bool_and(value->>'state'='pending') all_pending
         FROM public.platform_list_creator_requests(NULL,NULL,NULL)`,
      );
      expect(requests.rows[0]).toEqual({ count: 51, all_pending: true });
      await client.query("RESET ROLE");

      const { platform } = repositories(client);
      const firstSubmissionPage = await platform.listSubmissions(
        platformActor,
        { limit: 5 },
      );
      expect(firstSubmissionPage.items).toHaveLength(5);
      expect(
        firstSubmissionPage.items.every(
          (item) => item.state === "pending_review",
        ),
      ).toBe(true);
      const secondSubmissionPage = await platform.listSubmissions(
        platformActor,
        { limit: 5, cursor: firstSubmissionPage.nextCursor! },
      );
      expect(secondSubmissionPage.items).toHaveLength(5);
      expect(
        secondSubmissionPage.items.every(
          (item) => item.state === "pending_review",
        ),
      ).toBe(true);
      const firstRequestPage = await platform.listRequests(platformActor, {
        limit: 5,
      });
      expect(firstRequestPage.items).toHaveLength(5);
      expect(
        firstRequestPage.items.every((item) => item.state === "pending"),
      ).toBe(true);
      const secondRequestPage = await platform.listRequests(platformActor, {
        limit: 5,
        cursor: firstRequestPage.nextCursor!,
      });
      expect(secondRequestPage.items).toHaveLength(5);
      expect(
        secondRequestPage.items.every((item) => item.state === "pending"),
      ).toBe(true);
    }));

  it("enforces the global default quota and a per-user override under lock", async () =>
    transaction(async (client) => {
      const defaultActor = await human(client, "defaultquota");
      const overrideActor = await human(client, "overridequota");
      const admin = await operator(client);
      const { creator, platform } = repositories(client);
      for (let index = 0; index < 3; index += 1)
        await creator.createDraft(defaultActor, input(`default${index}`));
      await expect(
        creator.createDraft(defaultActor, input("default4")),
      ).rejects.toMatchObject({ code: "P0001" });
      await expect(
        platform.setQuota(admin, overrideActor.id, 1),
      ).resolves.toEqual({
        profileId: overrideActor.id,
        quota: 1,
      });
      await creator.createDraft(overrideActor, input("override1"));
      await expect(
        creator.createDraft(overrideActor, input("override2")),
      ).rejects.toMatchObject({ code: "P0001" });
    }));

  it("counts only active new-IP proposals while allowing changes and releasing rejected or deleted IPs", async () =>
    transaction(async (client) => {
      await client.query(
        "UPDATE public.platform_settings SET creator_ip_requires_approval=true",
      );
      const creatorActor = await human(client, "quotacycle");
      const platformActor = await operator(client);
      const { creator, platform } = repositories(client);
      await platform.setQuota(platformActor, creatorActor.id, 1);

      const rejectedDraft = await creator.createDraft(
        creatorActor,
        input("rejectedslot"),
      );
      const rejectedSubmission = await creator.submitDraft(
        creatorActor,
        {
          draftId: rejectedDraft.id,
          authorizationVersion: "terms-v1",
          references: await completeReferences(
            creator,
            creatorActor,
            rejectedDraft.id,
          ),
        },
        { requestId: randomUUID() },
      );
      await expect(
        creator.createDraft(creatorActor, input("blockedslot")),
      ).rejects.toMatchObject({ code: "P0001" });
      await platform.decideSubmission({
        actor: platformActor,
        submissionId: rejectedSubmission.id,
        decision: "reject",
        reason: "This proposal is not ready.",
        requestId: randomUUID(),
      });

      const approvedDraft = await creator.createDraft(
        creatorActor,
        input("replacementslot"),
      );
      const pendingApproval = await creator.submitDraft(
        creatorActor,
        {
          draftId: approvedDraft.id,
          authorizationVersion: "terms-v1",
          references: await completeReferences(
            creator,
            creatorActor,
            approvedDraft.id,
          ),
        },
        { requestId: randomUUID() },
      );
      const approved = await platform.decideSubmission({
        actor: platformActor,
        submissionId: pendingApproval.id,
        decision: "approve",
        requestId: randomUUID(),
      });
      const ipProfileId = approved.ipProfileId!;

      const changeDraft = await creator.createDraft(
        creatorActor,
        input("atquotachange", ipProfileId),
      );
      await completeReferences(creator, creatorActor, changeDraft.id);
      const change = await creator.createRequest(
        creatorActor,
        {
          ipProfileId,
          kind: "change",
          reason: "Please review this identity update.",
          proposedDraftId: changeDraft.id,
        },
        { requestId: randomUUID() },
      );
      await platform.decideRequest({
        actor: platformActor,
        requestId: change.id,
        decision: "reject",
        reason: "Keep the existing identity for now.",
        correlationId: randomUUID(),
      });
      const deletion = await creator.createRequest(
        creatorActor,
        {
          ipProfileId,
          kind: "deletion",
          reason: "Please permanently retire this identity.",
        },
        { requestId: randomUUID() },
      );
      await platform.decideRequest({
        actor: platformActor,
        requestId: deletion.id,
        decision: "approve",
        correlationId: randomUUID(),
      });
      await expect(
        creator.createDraft(creatorActor, input("afterdeletion")),
      ).resolves.toMatchObject({ status: "draft" });
    }));

  it("submits immutable snapshots and follows the approval switch", async () =>
    transaction(async (client) => {
      const actor = await human(client);
      const { creator } = repositories(client);
      await client.query(
        "UPDATE public.platform_settings SET creator_ip_requires_approval=true",
      );
      const pendingDraft = await creator.createDraft(actor, input("pending"));
      const pendingRefs = await completeReferences(
        creator,
        actor,
        pendingDraft.id,
      );
      const privateAssets = await client.query<{ object_key: string }>(
        "SELECT object_key FROM public.creator_reference_assets WHERE draft_id=$1 ORDER BY draft_role",
        [pendingDraft.id],
      );
      expect(privateAssets.rows).toHaveLength(5);
      expect(
        privateAssets.rows.every((asset) =>
          asset.object_key.startsWith(
            `private/creator/${actor.id}/${pendingDraft.id}/`,
          ),
        ),
      ).toBe(true);
      const pending = await creator.submitDraft(
        actor,
        {
          draftId: pendingDraft.id,
          authorizationVersion: "terms-v1",
          references: pendingRefs,
        },
        { requestId: randomUUID() },
      );
      expect(pending).toMatchObject({
        state: "pending_review",
        ipProfileId: null,
        revision: { displayName: "Creator pending" },
      });
      await expect(
        creator.updateDraft(actor, pendingDraft.id, input("changed")),
      ).rejects.toThrow();
      await client.query("SAVEPOINT immutable_check");
      await expect(
        client.query(
          "UPDATE public.creator_revisions SET display_name=$2 WHERE id=$1",
          [pending.revision.id, "mutated"],
        ),
      ).rejects.toThrow("append-only");
      await client.query("ROLLBACK TO SAVEPOINT immutable_check");
      await client.query("RELEASE SAVEPOINT immutable_check");
      await client.query(
        "UPDATE public.platform_settings SET creator_ip_requires_approval=false",
      );
      const approvedDraft = await creator.createDraft(
        actor,
        input("autoapproved"),
      );
      const approvedRefs = await completeReferences(
        creator,
        actor,
        approvedDraft.id,
      );
      const approved = await creator.submitDraft(
        actor,
        {
          draftId: approvedDraft.id,
          authorizationVersion: "terms-v1",
          references: approvedRefs,
        },
        { requestId: randomUUID() },
      );
      expect(approved.state).toBe("approved");
      const live = await client.query(
        `SELECT ip.source,ip.creator_profile_id,ip.public_state,ip.operation_enabled,
          ip.active_creator_revision_id,p.avatar_object_key,r.avatar_object_key AS revision_avatar_key,
          r.cover_object_key AS revision_cover_key
         FROM public.ip_profiles ip JOIN public.profiles p ON p.id=ip.profile_id
         JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id
         WHERE ip.profile_id=$1`,
        [approved.ipProfileId],
      );
      expect(live.rows[0]).toEqual({
        source: "creator",
        creator_profile_id: actor.id,
        public_state: "published",
        operation_enabled: false,
        active_creator_revision_id: approved.revision.id,
        avatar_object_key: null,
        revision_avatar_key: null,
        revision_cover_key: null,
      });
      const projected = await creator.getIp(actor, approved.ipProfileId!);
      expect(projected).toMatchObject({
        id: approved.ipProfileId,
        displayName: "Creator autoapproved",
        creator: { id: actor.id },
        references: approved.revision.references,
      });
      expect(JSON.stringify(projected)).not.toContain("objectKey");
    }));

  it("permits only operators to approve or reject and keeps decisions idempotent", async () =>
    transaction(async (client) => {
      await client.query(
        "UPDATE public.platform_settings SET creator_ip_requires_approval=true",
      );
      const creatorActor = await human(client);
      const realOperator = await operator(client);
      const nonOperator = await human(client, "notoperator");
      const { creator, platform } = repositories(client);
      const makeSubmission = async (name: string) => {
        const draft = await creator.createDraft(creatorActor, input(name));
        return creator.submitDraft(
          creatorActor,
          {
            draftId: draft.id,
            authorizationVersion: "terms-v1",
            references: await completeReferences(
              creator,
              creatorActor,
              draft.id,
            ),
          },
          { requestId: randomUUID() },
        );
      };
      const approvedInput = await makeSubmission("operatorapprove");
      await expect(
        platform.decideSubmission({
          actor: nonOperator,
          submissionId: approvedInput.id,
          decision: "approve",
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "42501" });
      const command = {
        actor: realOperator,
        submissionId: approvedInput.id,
        decision: "approve" as const,
        requestId: randomUUID(),
      };
      const approved = await platform.decideSubmission(command);
      expect(approved).toMatchObject({ state: "approved" });
      await expect(platform.decideSubmission(command)).resolves.toEqual(
        approved,
      );
      await expect(
        platform.decideSubmission({
          ...command,
          decision: "reject",
          reason: "Changed mind",
        }),
      ).rejects.toThrow("conflicting");

      const rejectedInput = await makeSubmission("operatorreject");
      const rejected = await platform.decideSubmission({
        actor: realOperator,
        submissionId: rejectedInput.id,
        decision: "reject",
        reason: "Not ready",
        requestId: randomUUID(),
      });
      expect(rejected).toMatchObject({
        state: "rejected",
        ipProfileId: null,
        decisionReason: "Not ready",
      });
    }));

  it("requires approved platform decisions for change, unpublish, and deletion requests", async () =>
    transaction(async (client) => {
      const changeFixture = await createApprovedIp(client);
      const changeDraft = await changeFixture.repos.creator.createDraft(
        changeFixture.creatorActor,
        input("replacement", changeFixture.ipProfileId),
      );
      await completeReferences(
        changeFixture.repos.creator,
        changeFixture.creatorActor,
        changeDraft.id,
      );
      const change = await changeFixture.repos.creator.createRequest(
        changeFixture.creatorActor,
        {
          ipProfileId: changeFixture.ipProfileId,
          kind: "change",
          reason: "Please update the public identity.",
          proposedDraftId: changeDraft.id,
        },
        { requestId: randomUUID() },
      );
      expect(change).toMatchObject({
        state: "pending",
        proposedRevision: { displayName: "Creator replacement" },
      });
      await expect(
        changeFixture.repos.platform.getRequest(
          changeFixture.platformActor,
          change.id,
        ),
      ).resolves.toEqual(change);
      await expect(
        changeFixture.repos.platform.getRequest(
          changeFixture.creatorActor,
          change.id,
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        changeFixture.repos.platform.getRequest(
          changeFixture.platformActor,
          randomUUID(),
        ),
      ).resolves.toBeNull();
      const decidedChange = await changeFixture.repos.platform.decideRequest({
        actor: changeFixture.platformActor,
        requestId: change.id,
        decision: "approve",
        correlationId: randomUUID(),
      });
      expect(decidedChange.state).toBe("approved");
      const current = await client.query(
        "SELECT r.display_name FROM public.ip_profiles ip JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id WHERE ip.profile_id=$1",
        [changeFixture.ipProfileId],
      );
      expect(current.rows[0]?.display_name).toBe("Creator replacement");
      await expect(
        changeFixture.repos.creator.getIp(
          changeFixture.creatorActor,
          changeFixture.ipProfileId,
        ),
      ).resolves.toMatchObject({
        displayName: "Creator replacement",
        contentThemes: ["technology", "design"],
        references: decidedChange.proposedRevision!.references,
      });
      await expect(
        client.query(
          "SELECT active_creator_revision_id FROM public.ip_profiles WHERE profile_id=$1",
          [changeFixture.ipProfileId],
        ),
      ).resolves.toMatchObject({
        rows: [
          { active_creator_revision_id: decidedChange.proposedRevision!.id },
        ],
      });

      const unpublishFixture = await createApprovedIp(client);
      const unpublish = await unpublishFixture.repos.creator.createRequest(
        unpublishFixture.creatorActor,
        {
          ipProfileId: unpublishFixture.ipProfileId,
          kind: "unpublish",
          reason: "Please stop publishing this identity.",
        },
        { requestId: randomUUID() },
      );
      await expect(
        unpublishFixture.repos.creator.createRequest(
          unpublishFixture.creatorActor,
          {
            ipProfileId: unpublishFixture.ipProfileId,
            kind: "deletion",
            reason: "A second pending lifecycle action must fail.",
          },
          { requestId: randomUUID() },
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await unpublishFixture.repos.platform.decideRequest({
        actor: unpublishFixture.platformActor,
        requestId: unpublish.id,
        decision: "approve",
        correlationId: randomUUID(),
      });
      await expect(
        client.query(
          "SELECT public_state,operation_enabled FROM public.ip_profiles WHERE profile_id=$1",
          [unpublishFixture.ipProfileId],
        ),
      ).resolves.toMatchObject({
        rows: [{ public_state: "unpublished", operation_enabled: false }],
      });

      const terminalFixture = await createApprovedIp(client);
      const terminalRequest = await terminalFixture.repos.creator.createRequest(
        terminalFixture.creatorActor,
        {
          ipProfileId: terminalFixture.ipProfileId,
          kind: "unpublish",
          reason: "This request races with a terminal transition.",
        },
        { requestId: randomUUID() },
      );
      await client.query(
        "UPDATE public.ip_profiles SET creator_deleted_at=clock_timestamp() WHERE profile_id=$1",
        [terminalFixture.ipProfileId],
      );
      await expect(
        terminalFixture.repos.platform.decideRequest({
          actor: terminalFixture.platformActor,
          requestId: terminalRequest.id,
          decision: "approve",
          correlationId: randomUUID(),
        }),
      ).rejects.toThrow("terminal state");

      const deletionFixture = await createApprovedIp(client);
      const deletion = await deletionFixture.repos.creator.createRequest(
        deletionFixture.creatorActor,
        {
          ipProfileId: deletionFixture.ipProfileId,
          kind: "deletion",
          reason: "Please permanently retire this identity.",
        },
        { requestId: randomUUID() },
      );
      const deletionCommand = {
        actor: deletionFixture.platformActor,
        requestId: deletion.id,
        decision: "approve" as const,
        correlationId: randomUUID(),
      };
      const deleted =
        await deletionFixture.repos.platform.decideRequest(deletionCommand);
      expect(deleted.state).toBe("approved");
      await expect(
        deletionFixture.repos.platform.decideRequest(deletionCommand),
      ).resolves.toEqual(deleted);
      await expect(
        client.query(
          "SELECT public_state,operation_enabled,creator_deleted_at IS NOT NULL AS deleted FROM public.ip_profiles WHERE profile_id=$1",
          [deletionFixture.ipProfileId],
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            public_state: "unpublished",
            operation_enabled: false,
            deleted: true,
          },
        ],
      });
    }));

  it("uses IP-first locking for concurrent request creation and platform decisions", async () => {
    const setup = await pool.connect();
    let creatorActor: Awaited<ReturnType<typeof human>>;
    let platformActor: Awaited<ReturnType<typeof operator>>;
    let ipProfileId: string;
    let pendingRequestId: string;
    try {
      await setup.query("BEGIN");
      creatorActor = await human(setup, "lockcreator");
      platformActor = await operator(setup);
      ipProfileId = randomUUID();
      pendingRequestId = randomUUID();
      await setup.query(
        "INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'Lock order IP')",
        [
          ipProfileId,
          `lock_ip_${ipProfileId.replaceAll("-", "").slice(0, 18)}`,
        ],
      );
      await setup.query(
        "INSERT INTO public.ip_profiles(profile_id,source,creator_profile_id,public_state,operation_enabled) VALUES($1,'creator',$2,'approved',false)",
        [ipProfileId, creatorActor.id],
      );
      await setup.query(
        "INSERT INTO public.creator_ip_requests(id,ip_profile_id,creator_profile_id,kind,reason) VALUES($1,$2,$3,'unpublish','Exercise concurrent request decision locking.')",
        [pendingRequestId, ipProfileId, creatorActor.id],
      );
      await setup.query("COMMIT");
    } catch (error) {
      await setup.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      setup.release();
    }

    const creatorClient = await pool.connect();
    const platformClient = await pool.connect();
    const observerClient = await pool.connect();
    let decisionPromise: Promise<unknown> | undefined;
    try {
      await creatorClient.query("BEGIN");
      await platformClient.query("BEGIN");
      await creatorClient.query(
        "SELECT 1 FROM public.ip_profiles WHERE profile_id=$1 FOR UPDATE",
        [ipProfileId],
      );
      const platformPid = (
        await platformClient.query<{ pid: number }>(
          "SELECT pg_backend_pid() pid",
        )
      ).rows[0]!.pid;
      const platform = repositories(platformClient).platform;
      decisionPromise = platform
        .decideRequest({
          actor: platformActor,
          requestId: pendingRequestId,
          decision: "approve",
          correlationId: randomUUID(),
        })
        .catch((error: unknown) => error);

      let waitingOnIp = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const activity = await observerClient.query<{
          wait_event_type: string | null;
        }>("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [
          platformPid,
        ]);
        if (activity.rows[0]?.wait_event_type === "Lock") {
          waitingOnIp = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waitingOnIp).toBe(true);

      await observerClient.query("BEGIN");
      await expect(
        observerClient.query(
          "SELECT 1 FROM public.creator_ip_requests WHERE id=$1 FOR UPDATE NOWAIT",
          [pendingRequestId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await observerClient.query("ROLLBACK");

      await expect(
        repositories(creatorClient).creator.createRequest(
          creatorActor,
          {
            ipProfileId,
            kind: "deletion",
            reason: "A pending request still prevents the next request.",
          },
          { requestId: randomUUID() },
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await creatorClient.query("ROLLBACK");

      const decision = await decisionPromise;
      expect(decision).toMatchObject({
        id: pendingRequestId,
        state: "approved",
      });
      await platformClient.query("ROLLBACK");
    } finally {
      await creatorClient.query("ROLLBACK").catch(() => undefined);
      await platformClient.query("ROLLBACK").catch(() => undefined);
      await observerClient.query("ROLLBACK").catch(() => undefined);
      await observerClient.query(
        "DELETE FROM public.creator_ip_requests WHERE id=$1",
        [pendingRequestId!],
      );
      await observerClient.query(
        "DELETE FROM public.ip_profiles WHERE profile_id=$1",
        [ipProfileId!],
      );
      await observerClient.query("DELETE FROM public.profiles WHERE id=$1", [
        ipProfileId!,
      ]);
      await observerClient.query(
        "DELETE FROM public.profile_roles WHERE profile_id=$1",
        [platformActor!.id],
      );
      await observerClient.query(
        "DELETE FROM public.profiles WHERE id=ANY($1::uuid[])",
        [[creatorActor!.id, platformActor!.id]],
      );
      creatorClient.release();
      platformClient.release();
      observerClient.release();
    }
  });

  it("returns only owned read-only analytics", async () =>
    transaction(async (client) => {
      const fixture = await createApprovedIp(client);
      const other = await human(client, "analyticsother");
      await expect(
        fixture.repos.creator.getAnalytics(
          fixture.creatorActor,
          fixture.ipProfileId,
        ),
      ).resolves.toMatchObject({
        ipProfileId: fixture.ipProfileId,
        followerCount: 0,
        popularPosts: [],
      });
      await expect(
        fixture.repos.creator.getAnalytics(other, fixture.ipProfileId),
      ).resolves.toBeNull();
    }));

  it("rolls back domain state, authorization, audit, workflow, business event, and outbox together", async () =>
    transaction(async (client) => {
      // Acquire the DDL lock before fixture writes so parallel integration files
      // cannot form a lock cycle against creator rows held by this transaction.
      await client.query(
        "CREATE FUNCTION pg_temp.reject_creator_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced creator outbox failure'; END $$",
      );
      await client.query(
        "CREATE TRIGGER reject_creator_outbox BEFORE INSERT ON public.analytics_outbox FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_creator_outbox()",
      );
      await client.query(
        "UPDATE public.platform_settings SET creator_ip_requires_approval=false",
      );
      const actor = await human(client);
      const { creator } = repositories(client);
      const draft = await creator.createDraft(actor, input("rollback"));
      const references = await completeReferences(creator, actor, draft.id);
      const commandRequestId = randomUUID();
      await expect(
        creator.submitDraft(
          actor,
          { draftId: draft.id, authorizationVersion: "terms-v1", references },
          { requestId: commandRequestId },
        ),
      ).rejects.toThrow("forced creator outbox failure");
      for (const query of [
        [
          "SELECT 1 FROM public.creator_submissions WHERE draft_id=$1",
          draft.id,
        ],
        ["SELECT 1 FROM public.creator_revisions WHERE draft_id=$1", draft.id],
        [
          "SELECT 1 FROM public.operating_authorization_acceptances WHERE draft_id=$1",
          draft.id,
        ],
        [
          "SELECT 1 FROM public.audit_events WHERE request_id=$1 AND action='creator_submission_created'",
          commandRequestId,
        ],
        [
          "SELECT 1 FROM public.workflow_transitions WHERE request_id=$1 AND entity_type='creator_submission'",
          commandRequestId,
        ],
        [
          "SELECT 1 FROM public.business_events WHERE request_id=$1 AND event_name='creator_submission_created'",
          commandRequestId,
        ],
        [
          "SELECT 1 FROM public.analytics_outbox WHERE payload->>'request_id'=$1",
          commandRequestId,
        ],
      ] as const)
        await expect(client.query(query[0], [query[1]])).resolves.toMatchObject(
          { rowCount: 0 },
        );
      await expect(creator.getDraft(actor, draft.id)).resolves.toMatchObject({
        status: "draft",
      });
    }));
});
