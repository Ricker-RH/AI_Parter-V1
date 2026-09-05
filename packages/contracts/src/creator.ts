import { z } from "zod";
import { LocaleSchema } from "./account.js";

const uuid = z.uuid();
const dateTime = z.iso.datetime();
const nonblank = (maximum: number) => z.string().trim().min(1).max(maximum);
const uniqueStrings = <T extends z.ZodType<string>>(item: T, maximum: number) =>
  z
    .array(item)
    .max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length)
        context.addIssue({ code: "custom", message: "Values must be unique" });
    });

export const CreatorVisualTypeSchema = z.enum(["realistic", "anime", "hybrid"]);
export const CreatorGenerationResultSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(['queued', 'ready']),
  candidates: z.array(z.object({id:z.uuid(),readIntent:z.object({url:z.url(),method:z.literal('GET'),expiresAt:z.iso.datetime()})})).max(8),
});
export const CreatorReferenceRoleSchema = z.enum([
  "avatar",
  "cover",
  "portrait",
  "full_body",
  "supporting_1",
  "supporting_2",
  "supporting_3",
  "supporting_4",
]);
export const CreatorPersonaSchema = z.strictObject({
  personality: nonblank(1000),
  background: nonblank(2000),
  world: nonblank(2000),
  values: nonblank(1000),
  tone: nonblank(500),
  interests: uniqueStrings(nonblank(80), 20),
  boundaries: nonblank(1000),
  relationshipStyle: nonblank(1000),
});
export const CreatorDraftInputSchema = z.strictObject({
  targetIpProfileId: uuid.optional(),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{3,30}$/),
  displayName: nonblank(80),
  shortDescription: z.string().trim().max(500),
  languageCodes: uniqueStrings(LocaleSchema, 20).min(1),
  contentThemes: uniqueStrings(nonblank(80), 12).min(1),
  persona: CreatorPersonaSchema,
  visualType: CreatorVisualTypeSchema,
  appearance: nonblank(2000),
});

export const CreatorReferenceSelectionSchema = z.strictObject({
  assetId: uuid,
  role: CreatorReferenceRoleSchema,
});
export const CreatorSubmissionSchema = z
  .strictObject({
    draftId: uuid,
    authorizationVersion: nonblank(100),
    references: z.array(CreatorReferenceSelectionSchema).min(5).max(8),
  })
  .superRefine((value, context) => {
    const roles = value.references.map((reference) => reference.role);
    const assets = value.references.map((reference) => reference.assetId);
    if (new Set(roles).size !== roles.length)
      context.addIssue({
        code: "custom",
        path: ["references"],
        message: "Reference roles must be unique",
      });
    if (new Set(assets).size !== assets.length)
      context.addIssue({
        code: "custom",
        path: ["references"],
        message: "Reference assets must be unique",
      });
    for (const role of ["avatar", "cover", "portrait", "full_body"] as const) {
      if (!roles.includes(role))
        context.addIssue({
          code: "custom",
          path: ["references"],
          message: `${role} reference is required`,
        });
    }
    if (!roles.some((role) => role.startsWith("supporting_")))
      context.addIssue({
        code: "custom",
        path: ["references"],
        message: "A supporting reference is required",
      });
  });

export const CreatorRequestKindSchema = z.enum([
  "change",
  "unpublish",
  "deletion",
]);
export const CreatorRequestInputSchema = z
  .strictObject({
    ipProfileId: uuid,
    kind: CreatorRequestKindSchema,
    reason: z.string().trim().min(10).max(2000),
    proposedDraftId: uuid.optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "change" && !value.proposedDraftId)
      context.addIssue({
        code: "custom",
        path: ["proposedDraftId"],
        message: "Change requests require a proposed draft",
      });
    if (value.kind !== "change" && value.proposedDraftId)
      context.addIssue({
        code: "custom",
        path: ["proposedDraftId"],
        message: "Only change requests accept a proposed draft",
      });
  });

export const CreatorDecisionInputSchema = z
  .strictObject({
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "reject" && !value.reason)
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Rejection requires a reason",
      });
  });

export const CreatorReferenceSchema = z.strictObject({
  id: uuid,
  role: CreatorReferenceRoleSchema,
});
export const CreatorRevisionSchema = CreatorDraftInputSchema.extend({
  id: uuid,
  version: z.number().int().positive(),
  references: z.array(CreatorReferenceSchema).min(5).max(8),
  createdAt: dateTime,
}).strict();
export const CreatorDraftSchema = CreatorDraftInputSchema.extend({
  id: uuid,
  status: z.enum(["draft", "submitted"]),
  references: z.array(CreatorReferenceSchema).max(8),
  createdAt: dateTime,
  updatedAt: dateTime,
}).strict();
export const CreatorSubmissionRecordSchema = z.strictObject({
  id: uuid,
  draftId: uuid,
  revision: CreatorRevisionSchema,
  state: z.enum(["pending_review", "approved", "rejected"]),
  ipProfileId: uuid.nullable(),
  submittedAt: dateTime,
  decidedAt: dateTime.nullable(),
  decisionReason: z.string().max(2000).nullable(),
});
export const CreatorRequestSchema = z.strictObject({
  id: uuid,
  ipProfileId: uuid,
  kind: CreatorRequestKindSchema,
  reason: z.string().min(10).max(2000),
  state: z.enum(["pending", "approved", "rejected"]),
  proposedRevision: CreatorRevisionSchema.nullable(),
  createdAt: dateTime,
  decidedAt: dateTime.nullable(),
  decisionReason: z.string().max(2000).nullable(),
});

export const CreatorIpSchema = z.strictObject({
  id: uuid,
  username: z.string().regex(/^[a-z0-9_]{3,30}$/),
  displayName: z.string().min(1).max(80),
  shortDescription: z.string().max(500),
  languageCodes: z.array(LocaleSchema).max(20),
  contentThemes: z.array(z.string().min(1).max(80)).max(12),
  visualType: CreatorVisualTypeSchema,
  status: z.enum(["approved", "public", "paused", "unpublished", "deleted"]),
  operationEnabled: z.boolean(),
  creator: z.strictObject({
    id: uuid,
    username: z.string().regex(/^[a-z0-9_]{3,30}$/),
    displayName: z.string().min(1).max(80),
  }),
  references: z.array(CreatorReferenceSchema).min(5).max(8),
  createdAt: dateTime,
});
export const CreatorAnalyticsSchema = z.strictObject({
  ipProfileId: uuid,
  followerCount: z.number().int().nonnegative(),
  followerDelta: z.number().int(),
  publishedPostCount: z.number().int().nonnegative(),
  totalLikeCount: z.number().int().nonnegative(),
  totalCommentCount: z.number().int().nonnegative(),
  popularPosts: z
    .array(
      z.strictObject({
        postId: uuid,
        likeCount: z.number().int().nonnegative(),
        commentCount: z.number().int().nonnegative(),
        publishedAt: dateTime,
      }),
    )
    .max(20),
  asOf: dateTime,
});

export const CreatorCursorKindSchema = z.enum([
  "creator_drafts",
  "creator_submissions",
  "creator_requests",
  "creator_ips",
]);
export const CreatorCursorSchema = z.strictObject({
  v: z.literal(1),
  kind: CreatorCursorKindSchema,
  createdAt: dateTime,
  id: uuid,
});
export const CreatorDraftPageSchema = z.strictObject({
  items: z.array(CreatorDraftSchema),
  nextCursor: z.string().nullable(),
});
export const CreatorSubmissionPageSchema = z.strictObject({
  items: z.array(CreatorSubmissionRecordSchema),
  nextCursor: z.string().nullable(),
});
export const CreatorRequestPageSchema = z.strictObject({
  items: z.array(CreatorRequestSchema),
  nextCursor: z.string().nullable(),
});
export const CreatorIpPageSchema = z.strictObject({
  items: z.array(CreatorIpSchema),
  nextCursor: z.string().nullable(),
});

const base64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64urlEncode(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 3) {
    const a = value.charCodeAt(index);
    const b = value.charCodeAt(index + 1);
    const c = value.charCodeAt(index + 2);
    output +=
      base64[a >> 2]! +
      base64[((a & 3) << 4) | ((b || 0) >> 4)]! +
      (Number.isNaN(b) ? "" : base64[((b & 15) << 2) | ((c || 0) >> 6)]!) +
      (Number.isNaN(c) ? "" : base64[c & 63]!);
  }
  return output.replaceAll("+", "-").replaceAll("/", "_");
}
function base64urlDecode(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  let output = "";
  for (let index = 0; index < normalized.length; index += 4) {
    const a = base64.indexOf(normalized[index]!);
    const b = base64.indexOf(normalized[index + 1]!);
    const c = normalized[index + 2]
      ? base64.indexOf(normalized[index + 2]!)
      : 0;
    const d = normalized[index + 3]
      ? base64.indexOf(normalized[index + 3]!)
      : 0;
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error("invalid base64url");
    output += String.fromCharCode(
      (a << 2) | (b >> 4),
      ((b & 15) << 4) | (c >> 2),
      ((c & 3) << 6) | d,
    );
  }
  return output.replace(/\0+$/, "");
}

export function encodeCreatorCursor(cursor: CreatorCursor): string {
  return base64urlEncode(JSON.stringify(CreatorCursorSchema.parse(cursor)));
}
export function decodeCreatorCursor(
  value: string,
  expectedKind?: CreatorCursorKind,
): CreatorCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
      throw new Error("invalid base64url");
    const json = base64urlDecode(value);
    if (base64urlEncode(json) !== value)
      throw new Error("non-canonical base64url");
    const cursor = CreatorCursorSchema.parse(JSON.parse(json));
    if (expectedKind && cursor.kind !== expectedKind)
      throw new Error("wrong cursor kind");
    return cursor;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

export type CreatorVisualType = z.infer<typeof CreatorVisualTypeSchema>;
export type CreatorReferenceRole = z.infer<typeof CreatorReferenceRoleSchema>;
export type CreatorPersona = z.infer<typeof CreatorPersonaSchema>;
export type CreatorDraftInput = z.infer<typeof CreatorDraftInputSchema>;
export type CreatorSubmission = z.infer<typeof CreatorSubmissionSchema>;
export type CreatorRequestInput = z.infer<typeof CreatorRequestInputSchema>;
export type CreatorDecisionInput = z.infer<typeof CreatorDecisionInputSchema>;
export type CreatorRevision = z.infer<typeof CreatorRevisionSchema>;
export type CreatorDraft = z.infer<typeof CreatorDraftSchema>;
export type CreatorSubmissionRecord = z.infer<
  typeof CreatorSubmissionRecordSchema
>;
export type CreatorRequest = z.infer<typeof CreatorRequestSchema>;
export type CreatorIp = z.infer<typeof CreatorIpSchema>;
export type CreatorAnalytics = z.infer<typeof CreatorAnalyticsSchema>;
export type CreatorCursor = z.infer<typeof CreatorCursorSchema>;
export type CreatorCursorKind = z.infer<typeof CreatorCursorKindSchema>;
export type CreatorDraftPage = z.infer<typeof CreatorDraftPageSchema>;
export type CreatorSubmissionPage = z.infer<typeof CreatorSubmissionPageSchema>;
export type CreatorRequestPage = z.infer<typeof CreatorRequestPageSchema>;
export type CreatorIpPage = z.infer<typeof CreatorIpPageSchema>;
