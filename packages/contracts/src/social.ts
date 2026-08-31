import {z} from 'zod'
import {LocaleSchema} from './account.js'

const uuid = z.uuid()
const dateTime = z.iso.datetime()
const trimmed = (max: number) => z.string().trim().min(1).max(max)

export const FeedKindSchema = z.enum(['for_you', 'following'])
export const PageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).optional(),
})
export const FeedQuerySchema = z.strictObject({
  kind: FeedKindSchema,
  locale: LocaleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).optional(),
})
export const ChronologicalCursorSchema = z.strictObject({v: z.literal(1), kind: z.literal('chronological'), publishedAt: dateTime, id: uuid})
export const ForYouCursorSchema = z.strictObject({v: z.literal(1), kind: z.literal('for_you'), score: z.number().finite(), publishedAt: dateTime, id: uuid})
export const CursorSchema = z.discriminatedUnion('kind', [ChronologicalCursorSchema, ForYouCursorSchema])
export const CommentCursorSchema = z.strictObject({v: z.literal(1), kind: z.literal('comments'), createdAt: dateTime, id: uuid})

export type FeedKind = z.infer<typeof FeedKindSchema>
export type PageQuery = z.infer<typeof PageQuerySchema>
export type FeedQuery = z.infer<typeof FeedQuerySchema>
export type Cursor = z.infer<typeof CursorSchema>
export type CommentCursor = z.infer<typeof CommentCursorSchema>
export type Locale = z.infer<typeof LocaleSchema>

const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64urlEncode(value: string): string {
  let output = ''
  for (let index = 0; index < value.length; index += 3) { const a = value.charCodeAt(index); const b = value.charCodeAt(index + 1); const c = value.charCodeAt(index + 2); output += base64[a >> 2]! + base64[((a & 3) << 4) | ((b || 0) >> 4)]! + (Number.isNaN(b) ? '' : base64[((b & 15) << 2) | ((c || 0) >> 6)]!) + (Number.isNaN(c) ? '' : base64[c & 63]!) }
  return output.replaceAll('+', '-').replaceAll('/', '_')
}
function base64urlDecode(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  let output = ''
  for (let index = 0; index < normalized.length; index += 4) { const a = base64.indexOf(normalized[index]!); const b = base64.indexOf(normalized[index + 1]!); const c = normalized[index + 2] ? base64.indexOf(normalized[index + 2]!) : 0; const d = normalized[index + 3] ? base64.indexOf(normalized[index + 3]!) : 0; if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('invalid base64url'); output += String.fromCharCode((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d) }
  return output.replace(/\0+$/, '')
}
export function encodeCursor(cursor: Cursor): string { return base64urlEncode(JSON.stringify(CursorSchema.parse(cursor))) }
export function decodeCursor(value: string, expectedKind?: FeedKind): Cursor {
  let decoded: unknown
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url')
    decoded = JSON.parse(base64urlDecode(value))
  } catch { throw new Error('INVALID_CURSOR') }
  const cursor = CursorSchema.safeParse(decoded)
  if (!cursor.success || (expectedKind && cursor.data.kind !== (expectedKind === 'following' ? 'chronological' : 'for_you'))) throw new Error('INVALID_CURSOR')
  return cursor.data
}

export const PublicIpSchema = z.strictObject({kind: z.literal('ip'), id: uuid, username: z.string().min(3).max(30), displayName: z.string().min(1).max(80), bio: z.string().max(500).nullable().optional(), languages: z.array(LocaleSchema)})
export const PublicHumanSchema = z.strictObject({kind: z.literal('human'), id: uuid, username: z.string().min(3).max(30), displayName: z.string().min(1).max(80)})
export const PublicCommentAuthorSchema = z.discriminatedUnion('kind',[PublicIpSchema,PublicHumanSchema])
export const FeedPostSchema = z.strictObject({id: uuid, body: z.string().max(5000), languageCode: z.string().nullable(), publishedAt: dateTime, author: PublicIpSchema, likeCount: z.number().int().nonnegative(), commentCount: z.number().int().nonnegative(), viewerHasLiked: z.boolean().optional(), viewerHasBookmarked: z.boolean().optional(), viewerFollowsAuthor: z.boolean().optional()})
export const PublicCommentSchema = z.strictObject({id: uuid, postId: uuid, parentCommentId: uuid.nullable(), author: PublicCommentAuthorSchema, state: z.enum(['published', 'deleted']), body: z.string().min(1).max(2000).optional(), createdAt: dateTime}).superRefine((value, context) => { if (value.state === 'published' && !value.body) context.addIssue({code: 'custom', message: 'Published comments require body'}) })
export const NotificationSchema = z.strictObject({id: uuid, kind: z.enum(['follow', 'post_like', 'comment', 'reply', 'comment_like']), actor: PublicCommentAuthorSchema.nullable(), postId: uuid.nullable(), commentId: uuid.nullable(), createdAt: dateTime, readAt: dateTime.nullable()})
export const FeedPageSchema = z.strictObject({items: z.array(FeedPostSchema), nextCursor: z.string().nullable()})
export const CommentPageSchema = z.strictObject({items: z.array(PublicCommentSchema), nextCursor: z.string().nullable()})
export const PostDetailSchema = FeedPostSchema.extend({comments: CommentPageSchema}).strict()
export const NotificationPageSchema = z.strictObject({items: z.array(NotificationSchema), nextCursor: z.string().nullable()})
export const CreateHumanCommentSchema = z.strictObject({body: trimmed(2000), parentCommentId: uuid.optional()})
export type PublicIp = z.infer<typeof PublicIpSchema>
export type FeedPost = z.infer<typeof FeedPostSchema>
export type PublicComment = z.infer<typeof PublicCommentSchema>
export type Notification = z.infer<typeof NotificationSchema>
export type FeedPage = z.infer<typeof FeedPageSchema>
export type PostDetail = z.infer<typeof PostDetailSchema>
export type NotificationPage = z.infer<typeof NotificationPageSchema>
export type CreateHumanComment = z.infer<typeof CreateHumanCommentSchema>
