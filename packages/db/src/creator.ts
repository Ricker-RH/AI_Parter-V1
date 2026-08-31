import {
  CreatorAnalyticsSchema,
  CreatorDecisionInputSchema,
  CreatorDraftInputSchema,
  CreatorDraftPageSchema,
  CreatorDraftSchema,
  CreatorIpPageSchema,
  CreatorIpSchema,
  CreatorRequestInputSchema,
  CreatorRequestPageSchema,
  CreatorRequestSchema,
  CreatorSubmissionPageSchema,
  CreatorSubmissionRecordSchema,
  CreatorSubmissionSchema,
  decodeCreatorCursor,
  encodeCreatorCursor,
  type CreatorAnalytics,
  type CreatorDecisionInput,
  type CreatorDraft,
  type CreatorDraftInput,
  type CreatorDraftPage,
  type CreatorIp,
  type CreatorIpPage,
  type CreatorRequest,
  type CreatorRequestInput,
  type CreatorRequestPage,
  type CreatorSubmission,
  type CreatorSubmissionPage,
  type CreatorSubmissionRecord,
  type CreatorCursorKind,
} from "@aifans/contracts";
import { z } from "zod";
import {
  type Actor,
  type QueryClient,
  type WithActor,
  type WithPlatformActor,
  withActor,
  withPlatformActor,
} from "./session.js";

export type CreatorCommandContext = { requestId: string };
export type CreatorPageQuery = { limit: number; cursor?: string };
export type CreatorReferenceRegistration = {
  id: string;
  contentType: string;
  width: number;
  height: number;
};

export type CreatorRepository = {
  createDraft(actor: Actor, input: CreatorDraftInput): Promise<CreatorDraft>;
  updateDraft(
    actor: Actor,
    draftId: string,
    input: CreatorDraftInput,
  ): Promise<CreatorDraft>;
  deleteDraft(actor: Actor, draftId: string): Promise<{ deleted: boolean }>;
  getDraft(actor: Actor, draftId: string): Promise<CreatorDraft | null>;
  listDrafts(actor: Actor, page: CreatorPageQuery): Promise<CreatorDraftPage>;
  getIp(actor: Actor, ipProfileId: string): Promise<CreatorIp | null>;
  listIps(actor: Actor, page: CreatorPageQuery): Promise<CreatorIpPage>;
  registerReference(
    actor: Actor,
    draftId: string,
    input: CreatorReferenceRegistration,
  ): Promise<{ created: boolean }>;
  submitDraft(
    actor: Actor,
    input: CreatorSubmission,
    context: CreatorCommandContext,
  ): Promise<CreatorSubmissionRecord>;
  getSubmission(
    actor: Actor,
    submissionId: string,
  ): Promise<CreatorSubmissionRecord | null>;
  listSubmissions(
    actor: Actor,
    page: CreatorPageQuery,
  ): Promise<CreatorSubmissionPage>;
  createRequest(
    actor: Actor,
    input: CreatorRequestInput,
    context: CreatorCommandContext,
  ): Promise<CreatorRequest>;
  listRequests(
    actor: Actor,
    page: CreatorPageQuery,
  ): Promise<CreatorRequestPage>;
  getAnalytics(
    actor: Actor,
    ipProfileId: string,
  ): Promise<CreatorAnalytics | null>;
};

export type PlatformSubmissionDecision = CreatorDecisionInput & {
  actor: Actor;
  submissionId: string;
  requestId: string;
};
export type PlatformRequestDecision = CreatorDecisionInput & {
  actor: Actor;
  requestId: string;
  correlationId: string;
};
export type PlatformCreatorRepository = {
  setQuota(
    actor: Actor,
    profileId: string,
    quota: number,
  ): Promise<{ profileId: string; quota: number }>;
  getSubmission(
    actor: Actor,
    submissionId: string,
  ): Promise<CreatorSubmissionRecord | null>;
  getRequest(actor: Actor, requestId: string): Promise<CreatorRequest | null>;
  listSubmissions(
    actor: Actor,
    page: CreatorPageQuery,
  ): Promise<CreatorSubmissionPage>;
  decideSubmission(
    input: PlatformSubmissionDecision,
  ): Promise<CreatorSubmissionRecord>;
  listRequests(
    actor: Actor,
    page: CreatorPageQuery,
  ): Promise<CreatorRequestPage>;
  decideRequest(input: PlatformRequestDecision): Promise<CreatorRequest>;
};

const uuid = z.uuid();
const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(50),
  cursor: z.string().min(1).optional(),
});
const registrationSchema = z.strictObject({
  id: uuid,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
});
const contextSchema = z.strictObject({ requestId: uuid });

type JsonRow = { value: unknown };
type PageRow = JsonRow & {
  cursor_created_at: Date | string;
  cursor_id: string;
};

function draftArguments(value: CreatorDraftInput): unknown[] {
  return [
    value.targetIpProfileId ?? null,
    value.username,
    value.displayName,
    value.shortDescription,
    value.languageCodes,
    value.contentThemes,
    value.persona.personality,
    value.persona.background,
    value.persona.world,
    value.persona.values,
    value.persona.tone,
    value.persona.interests,
    value.persona.boundaries,
    value.persona.relationshipStyle,
    value.visualType,
    value.appearance,
  ];
}

function requireValue<T>(
  rows: JsonRow[],
  parser: { parse(value: unknown): T },
  code: string,
): T {
  const row = rows[0];
  if (!row) throw new Error(code);
  return parser.parse(row.value);
}

async function page<T>(
  client: QueryClient,
  query: string,
  input: CreatorPageQuery,
  cursorKind: CreatorCursorKind,
  parser: { parse(value: unknown): T },
): Promise<{ items: T[]; nextCursor: string | null }> {
  const value = pageSchema.parse(input);
  const cursor = value.cursor
    ? decodeCreatorCursor(value.cursor, cursorKind)
    : null;
  const result = await client.query<PageRow>(query, [
    cursor?.createdAt ?? null,
    cursor?.id ?? null,
    value.limit + 1,
  ]);
  const rows = result.rows.slice(0, value.limit);
  const last = rows.at(-1);
  return {
    items: rows.map((row) => parser.parse(row.value)),
    nextCursor:
      result.rows.length > value.limit && last
        ? encodeCreatorCursor({
            v: 1,
            kind: cursorKind,
            createdAt:
              typeof last.cursor_created_at === "string"
                ? last.cursor_created_at
                : last.cursor_created_at.toISOString(),
            id: last.cursor_id,
          })
        : null,
  };
}

export function createCreatorRepository({
  withActor: runWithActor = withActor,
}: { withActor?: WithActor } = {}): CreatorRepository {
  return {
    async createDraft(actor, input) {
      const value = CreatorDraftInputSchema.parse(input);
      return runWithActor(actor, async (client) =>
        requireValue(
          (
            await client.query<JsonRow>(
              "SELECT public.creator_create_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) AS value",
              draftArguments(value),
            )
          ).rows,
          CreatorDraftSchema,
          "CREATOR_DRAFT_INVALID",
        ),
      );
    },
    async updateDraft(actor, draftId, input) {
      const id = uuid.parse(draftId);
      const value = CreatorDraftInputSchema.parse(input);
      return runWithActor(actor, async (client) =>
        requireValue(
          (
            await client.query<JsonRow>(
              "SELECT public.creator_update_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) AS value",
              [id, ...draftArguments(value)],
            )
          ).rows,
          CreatorDraftSchema,
          "CREATOR_DRAFT_NOT_FOUND",
        ),
      );
    },
    async deleteDraft(actor, draftId) {
      const id = uuid.parse(draftId);
      return runWithActor(actor, async (client) => ({
        deleted:
          (
            await client.query<{ deleted: boolean }>(
              "SELECT public.creator_delete_draft($1) AS deleted",
              [id],
            )
          ).rows[0]?.deleted === true,
      }));
    },
    async getDraft(actor, draftId) {
      const id = uuid.parse(draftId);
      return runWithActor(actor, async (client) => {
        const value = (
          await client.query<JsonRow>(
            "SELECT public.creator_get_draft($1) AS value",
            [id],
          )
        ).rows[0]?.value;
        return value == null ? null : CreatorDraftSchema.parse(value);
      });
    },
    async listDrafts(actor, input) {
      return runWithActor(actor, async (client) =>
        CreatorDraftPageSchema.parse(
          await page(
            client,
            "SELECT * FROM public.creator_list_drafts($1,$2,$3)",
            input,
            "creator_drafts",
            CreatorDraftSchema,
          ),
        ),
      );
    },
    async getIp(actor, ipProfileId) {
      const id = uuid.parse(ipProfileId);
      return runWithActor(actor, async (client) => {
        const value = (
          await client.query<JsonRow>(
            "SELECT public.creator_get_ip($1) AS value",
            [id],
          )
        ).rows[0]?.value;
        return value == null ? null : CreatorIpSchema.parse(value);
      });
    },
    async listIps(actor, input) {
      return runWithActor(actor, async (client) =>
        CreatorIpPageSchema.parse(
          await page(
            client,
            "SELECT * FROM public.creator_list_ips($1,$2,$3)",
            input,
            "creator_ips",
            CreatorIpSchema,
          ),
        ),
      );
    },
    async registerReference(actor, draftId, input) {
      const id = uuid.parse(draftId);
      const value = registrationSchema.parse(input);
      return runWithActor(actor, async (client) => ({
        created:
          (
            await client.query<{ created: boolean }>(
              "SELECT public.creator_register_reference($1,$2,$3,$4,$5) AS created",
              [id, value.id, value.contentType, value.width, value.height],
            )
          ).rows[0]?.created === true,
      }));
    },
    async submitDraft(actor, input, context) {
      const value = CreatorSubmissionSchema.parse(input);
      const command = contextSchema.parse(context);
      return runWithActor(actor, async (client) =>
        requireValue(
          (
            await client.query<JsonRow>(
              "SELECT public.creator_submit_draft($1,$2,$3,$4,$5) AS value",
              [
                value.draftId,
                value.authorizationVersion,
                value.references.map((reference) => reference.assetId),
                value.references.map((reference) => reference.role),
                command.requestId,
              ],
            )
          ).rows,
          CreatorSubmissionRecordSchema,
          "CREATOR_SUBMISSION_INVALID",
        ),
      );
    },
    async getSubmission(actor, submissionId) {
      const id = uuid.parse(submissionId);
      return runWithActor(actor, async (client) => {
        const value = (
          await client.query<JsonRow>(
            "SELECT public.creator_get_submission($1) AS value",
            [id],
          )
        ).rows[0]?.value;
        return value == null
          ? null
          : CreatorSubmissionRecordSchema.parse(value);
      });
    },
    async listSubmissions(actor, input) {
      return runWithActor(actor, async (client) =>
        CreatorSubmissionPageSchema.parse(
          await page(
            client,
            "SELECT * FROM public.creator_list_submissions($1,$2,$3)",
            input,
            "creator_submissions",
            CreatorSubmissionRecordSchema,
          ),
        ),
      );
    },
    async createRequest(actor, input, context) {
      const value = CreatorRequestInputSchema.parse(input);
      const command = contextSchema.parse(context);
      return runWithActor(actor, async (client) =>
        requireValue(
          (
            await client.query<JsonRow>(
              "SELECT public.creator_create_request($1,$2,$3,$4,$5) AS value",
              [
                value.ipProfileId,
                value.kind,
                value.reason,
                value.proposedDraftId ?? null,
                command.requestId,
              ],
            )
          ).rows,
          CreatorRequestSchema,
          "CREATOR_REQUEST_INVALID",
        ),
      );
    },
    async listRequests(actor, input) {
      return runWithActor(actor, async (client) =>
        CreatorRequestPageSchema.parse(
          await page(
            client,
            "SELECT * FROM public.creator_list_requests($1,$2,$3)",
            input,
            "creator_requests",
            CreatorRequestSchema,
          ),
        ),
      );
    },
    async getAnalytics(actor, ipProfileId) {
      const id = uuid.parse(ipProfileId);
      return runWithActor(actor, async (client) => {
        const value = (
          await client.query<JsonRow>(
            "SELECT public.creator_ip_analytics($1) AS value",
            [id],
          )
        ).rows[0]?.value;
        return value == null ? null : CreatorAnalyticsSchema.parse(value);
      });
    },
  };
}

export function createPlatformCreatorRepository({
  withPlatformActor: runWithPlatformActor = withPlatformActor,
}: { withPlatformActor?: WithPlatformActor } = {}): PlatformCreatorRepository {
  return {
    async setQuota(actor, profileId, quota) {
      const id = uuid.parse(profileId);
      const boundedQuota = z.number().int().min(0).max(100).parse(quota);
      return runWithPlatformActor(actor, async (client) => {
        const result = await client.query<{
          profile_id: string;
          ip_quota: number;
        }>("SELECT * FROM public.platform_set_creator_quota($1,$2)", [
          id,
          boundedQuota,
        ]);
        const row = result.rows[0];
        if (!row) throw new Error("CREATOR_QUOTA_INVALID");
        return { profileId: row.profile_id, quota: row.ip_quota };
      });
    },
    async getSubmission(actor, submissionId) {
      const id = uuid.parse(submissionId);
      return runWithPlatformActor(actor, async (client) => {
        const value = (
          await client.query<JsonRow>(
            "SELECT public.platform_get_creator_submission($1) AS value",
            [id],
          )
        ).rows[0]?.value;
        return value == null
          ? null
          : CreatorSubmissionRecordSchema.parse(value);
      });
    },
    async getRequest(actor, requestId) {
      const id = uuid.parse(requestId);
      return runWithPlatformActor(actor, async (client) => {
        const value = (
          await client.query<JsonRow>(
            "SELECT public.platform_get_creator_request($1) AS value",
            [id],
          )
        ).rows[0]?.value;
        return value == null ? null : CreatorRequestSchema.parse(value);
      });
    },
    async listSubmissions(actor, input) {
      return runWithPlatformActor(actor, async (client) =>
        CreatorSubmissionPageSchema.parse(
          await page(
            client,
            "SELECT * FROM public.platform_list_creator_submissions($1,$2,$3)",
            input,
            "creator_submissions",
            CreatorSubmissionRecordSchema,
          ),
        ),
      );
    },
    async decideSubmission(input) {
      const id = uuid.parse(input.submissionId);
      const requestId = uuid.parse(input.requestId);
      const decision = CreatorDecisionInputSchema.parse({
        decision: input.decision,
        reason: input.reason,
      });
      return runWithPlatformActor(input.actor, async (client) =>
        requireValue(
          (
            await client.query<JsonRow>(
              "SELECT public.platform_decide_creator_submission($1,$2,$3,$4) AS value",
              [id, decision.decision, decision.reason ?? null, requestId],
            )
          ).rows,
          CreatorSubmissionRecordSchema,
          "CREATOR_SUBMISSION_INVALID",
        ),
      );
    },
    async listRequests(actor, input) {
      return runWithPlatformActor(actor, async (client) =>
        CreatorRequestPageSchema.parse(
          await page(
            client,
            "SELECT * FROM public.platform_list_creator_requests($1,$2,$3)",
            input,
            "creator_requests",
            CreatorRequestSchema,
          ),
        ),
      );
    },
    async decideRequest(input) {
      const id = uuid.parse(input.requestId);
      const correlationId = uuid.parse(input.correlationId);
      const decision = CreatorDecisionInputSchema.parse({
        decision: input.decision,
        reason: input.reason,
      });
      return runWithPlatformActor(input.actor, async (client) =>
        requireValue(
          (
            await client.query<JsonRow>(
              "SELECT public.platform_decide_creator_request($1,$2,$3,$4) AS value",
              [id, decision.decision, decision.reason ?? null, correlationId],
            )
          ).rows,
          CreatorRequestSchema,
          "CREATOR_REQUEST_INVALID",
        ),
      );
    },
  };
}
