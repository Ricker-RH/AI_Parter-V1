import { describe, expect, it } from "vitest";
import {
  CreatorAnalyticsSchema,
  CreatorDraftInputSchema,
  CreatorDraftPageSchema,
  CreatorIpSchema,
  CreatorRequestInputSchema,
  CreatorRequestPageSchema,
  CreatorSubmissionPageSchema,
  CreatorSubmissionSchema,
  decodeCreatorCursor,
  encodeCreatorCursor,
} from "./creator.js";

const id = "5b8ba43c-0a9e-43ec-87be-448a9e1ebf30";
const otherId = "cf36c39c-98c0-4dc1-858c-38b739b45274";
const timestamp = "2026-09-01T12:00:00.000Z";

const persona = {
  personality: "Curious and thoughtful",
  background: "A fictional independent researcher.",
  world: "Contemporary Kuala Lumpur.",
  values: "Accuracy, kindness, and curiosity.",
  tone: "Warm and concise.",
  interests: ["technology", "design"],
  boundaries: "Does not give professional medical advice.",
  relationshipStyle: "A collaborative guide.",
};

const draft = {
  username: "creator_ip",
  displayName: "Creator IP",
  shortDescription: "A public-safe description.",
  languageCodes: ["en", "zh-CN"] as const,
  contentThemes: ["technology", "design"],
  persona,
  visualType: "hybrid" as const,
  appearance: "A consistent semi-realistic illustrated identity.",
};

const references = [
  { assetId: id, role: "avatar" as const },
  { assetId: otherId, role: "cover" as const },
  {
    assetId: "9f639801-5f1f-4ea2-a7a6-a0bc66207bde",
    role: "portrait" as const,
  },
  {
    assetId: "10b292eb-c123-413d-a622-35568a2c05ea",
    role: "full_body" as const,
  },
  {
    assetId: "3f19bb4a-fb79-47f5-89eb-127799603fc4",
    role: "supporting_1" as const,
  },
];

describe("creator contracts", () => {
  it("accepts only closed, bounded draft identity and persona inputs", () => {
    expect(CreatorDraftInputSchema.parse(draft)).toEqual(draft);
    expect(
      CreatorDraftInputSchema.safeParse({ ...draft, prompt: "secret" }).success,
    ).toBe(false);
    expect(
      CreatorDraftInputSchema.safeParse({
        ...draft,
        displayName: "x".repeat(81),
      }).success,
    ).toBe(false);
    expect(
      CreatorDraftInputSchema.safeParse({
        ...draft,
        contentThemes: ["x".repeat(81)],
      }).success,
    ).toBe(false);
    expect(
      CreatorDraftInputSchema.safeParse({
        ...draft,
        contentThemes: ["same", "same"],
      }).success,
    ).toBe(false);
    expect(
      CreatorDraftInputSchema.safeParse({
        ...draft,
        persona: { ...persona, background: "x".repeat(2001) },
      }).success,
    ).toBe(false);
    expect(
      CreatorDraftInputSchema.safeParse({
        ...draft,
        persona: { ...persona, operatorId: id },
      }).success,
    ).toBe(false);
  });

  it("accepts exactly the three formal visual types", () => {
    for (const visualType of ["realistic", "anime", "hybrid"]) {
      expect(
        CreatorDraftInputSchema.safeParse({ ...draft, visualType }).success,
      ).toBe(true);
    }
    expect(
      CreatorDraftInputSchema.safeParse({ ...draft, visualType: "mixed" })
        .success,
    ).toBe(false);
  });

  it("requires a versioned authorization acceptance and a unique complete reference set", () => {
    const submission = {
      draftId: id,
      authorizationVersion: "creator-terms-2026-09-01",
      references,
    };
    expect(CreatorSubmissionSchema.parse(submission)).toEqual(submission);
    expect(
      CreatorSubmissionSchema.safeParse({
        ...submission,
        authorizationVersion: "   ",
      }).success,
    ).toBe(false);
    expect(
      CreatorSubmissionSchema.safeParse({
        ...submission,
        references: references.slice(0, 4),
      }).success,
    ).toBe(false);
    expect(
      CreatorSubmissionSchema.safeParse({
        ...submission,
        references: [...references, { ...references[4], assetId: otherId }],
      }).success,
    ).toBe(false);
    expect(
      CreatorSubmissionSchema.safeParse({
        ...submission,
        references: references.map((value, index) =>
          index === 3 ? { ...value, role: "supporting_2" } : value,
        ),
      }).success,
    ).toBe(false);
    expect(
      CreatorSubmissionSchema.safeParse({
        ...submission,
        operatorProfileId: id,
      }).success,
    ).toBe(false);
  });

  it("bounds request reasons and only permits proposed drafts for change requests", () => {
    expect(
      CreatorRequestInputSchema.parse({
        ipProfileId: id,
        kind: "unpublish",
        reason: "  Please retire this identity.  ",
      }),
    ).toEqual({
      ipProfileId: id,
      kind: "unpublish",
      reason: "Please retire this identity.",
    });
    expect(
      CreatorRequestInputSchema.safeParse({
        ipProfileId: id,
        kind: "deletion",
        reason: "short",
      }).success,
    ).toBe(false);
    expect(
      CreatorRequestInputSchema.safeParse({
        ipProfileId: id,
        kind: "deletion",
        reason: "x".repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      CreatorRequestInputSchema.safeParse({
        ipProfileId: id,
        kind: "unpublish",
        reason: "A valid request reason.",
        proposedDraftId: otherId,
      }).success,
    ).toBe(false);
    expect(
      CreatorRequestInputSchema.safeParse({
        ipProfileId: id,
        kind: "change",
        reason: "A valid change request.",
        proposedDraftId: otherId,
      }).success,
    ).toBe(true);
    expect(
      CreatorRequestInputSchema.safeParse({
        ipProfileId: id,
        kind: "change",
        reason: "A valid change request.",
      }).success,
    ).toBe(false);
  });

  it("exposes strict public creator DTOs without private or privileged identities", () => {
    const ip = {
      id,
      username: "creator_ip",
      displayName: "Creator IP",
      shortDescription: "Description",
      languageCodes: ["en"],
      contentThemes: ["technology"],
      visualType: "hybrid",
      status: "public",
      operationEnabled: false,
      creator: {
        id: otherId,
        username: "human_creator",
        displayName: "Human Creator",
      },
      references: references.map(({ assetId, role }) => ({
        id: assetId,
        role,
      })),
      createdAt: timestamp,
    };
    expect(CreatorIpSchema.parse(ip)).toEqual(ip);
    for (const leaked of [
      { ...ip, prompt: "private" },
      { ...ip, objectKey: "private/path" },
      { ...ip, operatorProfileId: id },
      { ...ip, authSubject: "auth0|secret" },
      { ...ip, viewerIdentity: { subject: "secret" } },
    ])
      expect(CreatorIpSchema.safeParse(leaked).success).toBe(false);

    expect(
      CreatorAnalyticsSchema.parse({
        ipProfileId: id,
        followerCount: 3,
        followerDelta: 1,
        publishedPostCount: 2,
        totalLikeCount: 4,
        totalCommentCount: 5,
        popularPosts: [
          {
            postId: otherId,
            likeCount: 4,
            commentCount: 5,
            publishedAt: timestamp,
          },
        ],
        asOf: timestamp,
      }),
    ).toMatchObject({ ipProfileId: id, followerCount: 3 });
  });

  it("round trips strict keyset cursors and validates every creator page envelope", () => {
    const cursor = {
      v: 1 as const,
      kind: "creator_drafts" as const,
      createdAt: timestamp,
      id,
    };
    expect(
      decodeCreatorCursor(encodeCreatorCursor(cursor), "creator_drafts"),
    ).toEqual(cursor);
    expect(() =>
      decodeCreatorCursor(encodeCreatorCursor(cursor), "creator_requests"),
    ).toThrow("INVALID_CURSOR");
    expect(() =>
      decodeCreatorCursor(
        Buffer.from(
          JSON.stringify({ ...cursor, authSubject: "secret" }),
        ).toString("base64url"),
      ),
    ).toThrow("INVALID_CURSOR");
    expect(
      CreatorDraftPageSchema.parse({ items: [], nextCursor: null }),
    ).toEqual({ items: [], nextCursor: null });
    expect(
      CreatorSubmissionPageSchema.parse({ items: [], nextCursor: null }),
    ).toEqual({ items: [], nextCursor: null });
    expect(
      CreatorRequestPageSchema.parse({ items: [], nextCursor: null }),
    ).toEqual({ items: [], nextCursor: null });
    expect(
      CreatorRequestPageSchema.safeParse({
        items: [],
        nextCursor: null,
        viewerId: id,
      }).success,
    ).toBe(false);
  });
});
