import { z } from "zod";
import { LocaleSchema } from "./account.js";
import { CreatorVisualTypeSchema } from "./creator.js";

const uuid = z.uuid();
const dateTime = z.iso.datetime();
const trimmed = (max: number) => z.string().trim().min(1).max(max);
export const POST_MEDIA_MAX_BYTES = 10_485_760;

export const FeedKindSchema = z.enum(["for_you", "following"]);
export const PageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).optional(),
});
const FeedQueryInputSchema = z.strictObject({
  kind: FeedKindSchema,
  locale: LocaleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).optional(),
});
export const FeedQuerySchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  const { visualType: _legacyVisualType, ...query } = value as Record<
    string,
    unknown
  >;
  return query;
}, FeedQueryInputSchema);
const searchText = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(80));
export const SearchCategorySchema = z.enum(["all", "ips", "posts"]);
export const SearchQuerySchema = z.strictObject({
  q: searchText,
  category: SearchCategorySchema.default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).optional(),
});
export const ChronologicalCursorSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("chronological"),
  publishedAt: dateTime,
  id: uuid,
});
export const ForYouCursorSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("for_you"),
  score: z.number().finite(),
  publishedAt: dateTime,
  id: uuid,
});
export const CursorSchema = z.discriminatedUnion("kind", [
  ChronologicalCursorSchema,
  ForYouCursorSchema,
]);
export const CommentCursorSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("comments"),
  createdAt: dateTime,
  id: uuid,
});
export const NotificationCursorSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("notifications"),
  createdAt: dateTime,
  id: uuid,
});
export const LikedCursorSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("liked"),
  likedAt: dateTime,
  id: uuid,
});
export const FollowedIpCursorSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("followed_ips"),
  profileCreatedAt: dateTime,
  id: uuid,
});
const SearchCursorBaseSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("search"),
  category: SearchCategorySchema,
  query: z.string().min(1).max(80),
});
export const SearchCursorSchema = z.discriminatedUnion("resultType", [
  SearchCursorBaseSchema.extend({
    resultType: z.literal("profile"),
    displayName: z.string().min(1).max(80),
    id: uuid,
  }),
  SearchCursorBaseSchema.extend({
    resultType: z.literal("post"),
    publishedAt: dateTime,
    id: uuid,
  }),
]);

export type FeedKind = z.infer<typeof FeedKindSchema>;
export type PageQuery = z.infer<typeof PageQuerySchema>;
export type FeedQuery = z.infer<typeof FeedQuerySchema>;
export type SearchCategory = z.infer<typeof SearchCategorySchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchCursor = z.infer<typeof SearchCursorSchema>;
export type Cursor = z.infer<typeof CursorSchema>;
export type CommentCursor = z.infer<typeof CommentCursorSchema>;
export type NotificationCursor = z.infer<typeof NotificationCursorSchema>;
export type LikedCursor = z.infer<typeof LikedCursorSchema>;
export type FollowedIpCursor = z.infer<typeof FollowedIpCursorSchema>;
export type Locale = z.infer<typeof LocaleSchema>;

const base64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64urlEncode(value: string): string {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; ) {
    if (encoded[index] === "%") {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 3;
    } else {
      bytes.push(encoded.charCodeAt(index));
      index += 1;
    }
  }
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output +=
      base64[a >> 2]! +
      base64[((a & 3) << 4) | ((b || 0) >> 4)]! +
      (b === undefined ? "" : base64[((b & 15) << 2) | ((c ?? 0) >> 6)]!) +
      (c === undefined ? "" : base64[c & 63]!);
  }
  return output.replaceAll("+", "-").replaceAll("/", "_");
}
function base64urlDecode(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const bytes: number[] = [];
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
    bytes.push((a << 2) | (b >> 4));
    if (index + 2 < normalized.length) bytes.push(((b & 15) << 4) | (c >> 2));
    if (index + 3 < normalized.length) bytes.push(((c & 3) << 6) | d);
  }
  return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""));
}
export function encodeCursor(cursor: Cursor): string {
  return base64urlEncode(JSON.stringify(CursorSchema.parse(cursor)));
}
export function decodeCursor(value: string, expectedKind?: FeedKind): Cursor {
  let decoded: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
    decoded = JSON.parse(base64urlDecode(value));
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const cursor = CursorSchema.safeParse(decoded);
  if (
    !cursor.success ||
    (expectedKind &&
      cursor.data.kind !==
        (expectedKind === "following" ? "chronological" : "for_you"))
  )
    throw new Error("INVALID_CURSOR");
  return cursor.data;
}
export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return base64urlEncode(
    JSON.stringify(NotificationCursorSchema.parse(cursor)),
  );
}
export function decodeNotificationCursor(value: string): NotificationCursor {
  let decoded: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
      throw new Error("invalid base64url");
    const json = base64urlDecode(value);
    if (base64urlEncode(json) !== value)
      throw new Error("non-canonical base64url");
    decoded = JSON.parse(json);
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const cursor = NotificationCursorSchema.safeParse(decoded);
  if (!cursor.success) throw new Error("INVALID_CURSOR");
  return cursor.data;
}
export function encodeLikedCursor(cursor: LikedCursor): string {
  return base64urlEncode(JSON.stringify(LikedCursorSchema.parse(cursor)));
}
export function decodeLikedCursor(value: string): LikedCursor {
  let decoded: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
      throw new Error("invalid base64url");
    const json = base64urlDecode(value);
    if (base64urlEncode(json) !== value) throw new Error("non-canonical base64url");
    decoded = JSON.parse(json);
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const cursor = LikedCursorSchema.safeParse(decoded);
  if (!cursor.success) throw new Error("INVALID_CURSOR");
  return cursor.data;
}
export function encodeFollowedIpCursor(cursor: FollowedIpCursor): string {
  return base64urlEncode(JSON.stringify(FollowedIpCursorSchema.parse(cursor)));
}
export function decodeFollowedIpCursor(value: string): FollowedIpCursor {
  let decoded: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
      throw new Error("invalid base64url");
    const json = base64urlDecode(value);
    if (base64urlEncode(json) !== value) throw new Error("non-canonical base64url");
    decoded = JSON.parse(json);
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const cursor = FollowedIpCursorSchema.safeParse(decoded);
  if (!cursor.success) throw new Error("INVALID_CURSOR");
  return cursor.data;
}
export function encodeSearchCursor(cursor: SearchCursor): string {
  return base64urlEncode(JSON.stringify(SearchCursorSchema.parse(cursor)));
}
export function decodeSearchCursor(
  value: string,
  expected?: {category?: SearchCategory; query?: string},
): SearchCursor {
  let decoded: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
      throw new Error("invalid base64url");
    const json = base64urlDecode(value);
    if (base64urlEncode(json) !== value) throw new Error("non-canonical base64url");
    decoded = JSON.parse(json);
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const cursor = SearchCursorSchema.safeParse(decoded);
  if (
    !cursor.success ||
    (expected?.category && cursor.data.category !== expected.category) ||
    (expected?.query && cursor.data.query !== expected.query)
  )
    throw new Error("INVALID_CURSOR");
  return cursor.data;
}

export const PublicCreatorSchema = z.strictObject({
  id: uuid,
  username: z.string().min(3).max(30),
  displayName: z.string().min(1).max(80),
});
export const PublicIpSchema = z.strictObject({
  kind: z.literal("ip"),
  id: uuid,
  username: z.string().min(3).max(30),
  displayName: z.string().min(1).max(80),
  bio: z.string().max(500).nullable().optional(),
  languages: z.array(LocaleSchema),
  visualType: CreatorVisualTypeSchema,
  creator: PublicCreatorSchema.optional(),
});
const FeedIpSchema = PublicIpSchema.extend({
  followerCount: z.number().int().nonnegative().optional(),
});
const FeedPageIpSchema = PublicIpSchema.extend({
  followerCount: z.number().int().nonnegative(),
});
export const FollowedIpSchema = PublicIpSchema.extend({
  followerCount: z.number().int().nonnegative(),
});
export const PublicHumanSchema = z.strictObject({
  kind: z.literal("human"),
  id: uuid,
  username: z.string().min(3).max(30),
  displayName: z.string().min(1).max(80),
});
export const PublicCommentAuthorSchema = z.discriminatedUnion("kind", [
  PublicIpSchema,
  PublicHumanSchema,
]);
export const PostImageContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const PublicPostMediaSchema = z.strictObject({
  id: uuid,
  type: z.literal("image"),
  url: z.url().refine((value) => value.startsWith("https://")),
  altText: z.string().max(1000).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  aspectRatio: z.number().positive().nullable(),
});
export const FeedPostSchema = z.strictObject({
  id: uuid,
  body: z.string().max(5000),
  languageCode: z.string().nullable(),
  publishedAt: dateTime,
  author: FeedIpSchema,
  media: z.array(PublicPostMediaSchema).max(4).optional(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  viewerHasLiked: z.boolean().optional(),
  viewerHasBookmarked: z.boolean().optional(),
  viewerFollowsAuthor: z.boolean().optional(),
});
export const PublicCommentSchema = z
  .strictObject({
    id: uuid,
    postId: uuid,
    parentCommentId: uuid.nullable(),
    author: PublicCommentAuthorSchema,
    state: z.enum(["published", "deleted"]),
    body: z.string().min(1).max(2000).optional(),
    createdAt: dateTime,
  })
  .superRefine((value, context) => {
    if (value.state === "published" && !value.body)
      context.addIssue({
        code: "custom",
        message: "Published comments require body",
      });
  });
export const NotificationSchema = z.strictObject({
  id: uuid,
  kind: z.enum(["follow", "post_like", "comment", "reply", "comment_like"]),
  actor: PublicCommentAuthorSchema.nullable(),
  postId: uuid.nullable(),
  commentId: uuid.nullable(),
  createdAt: dateTime,
  readAt: dateTime.nullable(),
});
export const FeedPageSchema = z.strictObject({
  items: z.array(FeedPostSchema.extend({author: FeedPageIpSchema})),
  nextCursor: z.string().nullable(),
});
export const FollowedIpPageSchema = z.strictObject({
  items: z.array(FollowedIpSchema),
  nextCursor: z.string().nullable(),
});
export const SearchResultSchema = z.discriminatedUnion("type", [
  z.strictObject({type: z.literal("profile"), profile: PublicIpSchema}),
  z.strictObject({type: z.literal("post"), post: FeedPostSchema}),
]);
export const SearchPageSchema = z.strictObject({
  items: z.array(SearchResultSchema),
  nextCursor: z.string().nullable(),
});
export const PublicIpProfileSchema = z.strictObject({
  profile: PublicIpSchema,
  followerCount: z.number().int().nonnegative(),
  viewerFollows: z.boolean().optional(),
  posts: FeedPageSchema,
});
export const CommentPageSchema = z.strictObject({
  items: z.array(PublicCommentSchema),
  nextCursor: z.string().nullable(),
});
export const PostDetailSchema = FeedPostSchema.extend({
  comments: CommentPageSchema,
}).strict();
export const NotificationPageSchema = z.strictObject({
  items: z.array(NotificationSchema),
  nextCursor: z.string().nullable(),
});
export const CreateHumanCommentSchema = z.strictObject({
  body: trimmed(2000),
  parentCommentId: uuid.optional(),
});
export const CreateIpSchema = z.strictObject({
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{3,30}$/),
  displayName: trimmed(80),
  bio: z.string().trim().max(500).optional(),
  languageCodes: z.array(LocaleSchema).max(20).optional(),
});
export const CreatePostSchema = z
  .strictObject({
    ipProfileId: uuid,
    body: z.string().trim().max(5000),
    languageCode: z
      .string()
      .trim()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
      .optional(),
    media: z
      .array(
        z.strictObject({
          reservationId: uuid,
          altText: z.string().trim().max(1000).nullable().optional(),
        }),
      )
      .max(4)
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.body && (value.media?.length ?? 0) === 0)
      context.addIssue({
        code: "custom",
        message: "Post requires text or media",
      });
  });
export const PostMediaUploadIntentRequestSchema = z.strictObject({
  contentType: PostImageContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(POST_MEDIA_MAX_BYTES),
});
export const PostMediaUploadIntentResponseSchema = z.strictObject({
  reservationId: uuid,
  method: z.literal("PUT"),
  url: z.url().refine((value) => value.startsWith("https://")),
  headers: z.strictObject({ "content-type": PostImageContentTypeSchema }),
  expiresAt: dateTime,
  maxBytes: z.literal(POST_MEDIA_MAX_BYTES),
});
export const RegisterPostMediaSchema = z.strictObject({
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
});
export const RegisteredPostMediaSchema = z.strictObject({
  reservationId: uuid,
  contentType: PostImageContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(POST_MEDIA_MAX_BYTES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export const CreateIpCommentSchema = z.strictObject({
  ipProfileId: uuid,
  body: trimmed(2000),
  parentCommentId: uuid.optional(),
});
export const CreateIpResponseSchema = PublicIpSchema;
export const CreatePostResponseSchema = FeedPostSchema;
export const CreateIpCommentResponseSchema = PublicCommentSchema;
export type PublicIp = z.infer<typeof PublicIpSchema>;
export type FeedPost = z.infer<typeof FeedPostSchema>;
export type PublicPostMedia = z.infer<typeof PublicPostMediaSchema>;
export type PostImageContentType = z.infer<typeof PostImageContentTypeSchema>;
export type PostMediaUploadIntentRequest = z.infer<
  typeof PostMediaUploadIntentRequestSchema
>;
export type PostMediaUploadIntentResponse = z.infer<
  typeof PostMediaUploadIntentResponseSchema
>;
export type RegisterPostMedia = z.infer<typeof RegisterPostMediaSchema>;
export type RegisteredPostMedia = z.infer<typeof RegisteredPostMediaSchema>;
export type PublicComment = z.infer<typeof PublicCommentSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type FeedPage = z.infer<typeof FeedPageSchema>;
export type FollowedIp = z.infer<typeof FollowedIpSchema>;
export type FollowedIpPage = z.infer<typeof FollowedIpPageSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchPage = z.infer<typeof SearchPageSchema>;
export type PublicIpProfile = z.infer<typeof PublicIpProfileSchema>;
export type PostDetail = z.infer<typeof PostDetailSchema>;
export type NotificationPage = z.infer<typeof NotificationPageSchema>;
export type CreateHumanComment = z.infer<typeof CreateHumanCommentSchema>;
export type CreateIpInput = z.infer<typeof CreateIpSchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type CreateIpCommentInput = z.infer<typeof CreateIpCommentSchema>;
export type CreateIpResponse = z.infer<typeof CreateIpResponseSchema>;
export type CreatePostResponse = z.infer<typeof CreatePostResponseSchema>;
export type CreateIpCommentResponse = z.infer<
  typeof CreateIpCommentResponseSchema
>;
