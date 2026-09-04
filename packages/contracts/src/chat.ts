import {z} from 'zod'
import {LocaleSchema} from './account.js'

const uuid = z.uuid()
const dateTime = z.iso.datetime()
export const MAX_CHAT_CURSOR_LENGTH = 1024
export const ChatBodySchema = z.string().min(1).max(4000)

export const ChatIpIdentitySchema = z.strictObject({
  id: uuid,
  username: z.string().min(3).max(30),
  displayName: z.string().min(1).max(80),
})
export const ChatMessageRoleSchema = z.enum(['human', 'assistant'])
export const ChatMessageDeliveryStateSchema = z.enum(['pending', 'sent', 'failed'])
const ChatLastMessageSchema = z.strictObject({body: ChatBodySchema, role: ChatMessageRoleSchema, createdAt: dateTime})
export const ChatConversationSummarySchema = z.strictObject({id: uuid, ipProfile: ChatIpIdentitySchema, lastMessage: ChatLastMessageSchema.nullable(), updatedAt: dateTime, sendEnabled: z.boolean(), unreadCount: z.number().int().min(0).optional()})
export const ChatConversationPageSchema = z.strictObject({items: z.array(ChatConversationSummarySchema).max(100), nextCursor: z.string().min(1).max(MAX_CHAT_CURSOR_LENGTH).nullable()})
export const ChatGenerationSchema = z.strictObject({state:z.enum(['generating','partial','failed','completed']),answer:z.string().max(4000)})
export const ChatMessageSchema = z.strictObject({id: uuid, role: ChatMessageRoleSchema, body: ChatBodySchema, deliveryState: ChatMessageDeliveryStateSchema, createdAt: dateTime,generation:ChatGenerationSchema.optional(),clientRequestId:uuid.optional(),inReplyToClientRequestId:uuid.optional()})
export const ChatHistoryPageSchema = z.strictObject({conversation: ChatConversationSummarySchema, items: z.array(ChatMessageSchema).max(100), nextCursor: z.string().min(1).max(MAX_CHAT_CURSOR_LENGTH).nullable()})
export const ChatConversationCreateInputSchema = z.strictObject({ipProfileId: uuid})
export const ChatSendInputSchema = z.strictObject({message: z.string().trim().pipe(ChatBodySchema), requestId: uuid, locale: LocaleSchema.optional()})
export const ChatSendResponseSchema = z.strictObject({humanMessage: ChatMessageSchema, assistantMessage: ChatMessageSchema.optional()})
export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('human_message'), message: ChatMessageSchema}),
  z.strictObject({type: z.literal('assistant_delta'), delta: ChatBodySchema}),
  z.strictObject({type: z.literal('assistant_complete'), message: ChatMessageSchema}),
  z.strictObject({type: z.literal('failed'), code: z.enum(['CHAT_PROVIDER_ERROR', 'CHAT_INTERRUPTED'])}),
])
export const ChatConversationCursorSchema = z.strictObject({v: z.literal(1), kind: z.literal('chat-conversations'), updatedAt: dateTime, id: uuid})
export const ChatMessageCursorSchema = z.strictObject({v: z.literal(1), kind: z.literal('chat-messages'), createdAt: dateTime, id: uuid})

const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64urlEncode(value: string): string {
  const encoded = encodeURIComponent(value)
  const bytes: number[] = []
  for (let index = 0; index < encoded.length;) {
    if (encoded[index] === '%') { bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16)); index += 3 } else { bytes.push(encoded.charCodeAt(index)); index += 1 }
  }
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!, b = bytes[index + 1], c = bytes[index + 2]
    output += base64[a >> 2]! + base64[((a & 3) << 4) | ((b || 0) >> 4)]! + (b === undefined ? '' : base64[((b & 15) << 2) | ((c ?? 0) >> 6)]!) + (c === undefined ? '' : base64[c & 63]!)
  }
  return output.replaceAll('+', '-').replaceAll('/', '_')
}
function base64urlDecode(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const bytes: number[] = []
  for (let index = 0; index < normalized.length; index += 4) {
    const a = base64.indexOf(normalized[index]!), b = base64.indexOf(normalized[index + 1]!), c = normalized[index + 2] ? base64.indexOf(normalized[index + 2]!) : 0, d = normalized[index + 3] ? base64.indexOf(normalized[index + 3]!) : 0
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('invalid base64url')
    bytes.push((a << 2) | (b >> 4)); if (index + 2 < normalized.length) bytes.push(((b & 15) << 4) | (c >> 2)); if (index + 3 < normalized.length) bytes.push(((c & 3) << 6) | d)
  }
  return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''))
}
function decodeChatCursor<T>(value: string, schema: z.ZodType<T>): T {
  try {
    if (value.length > MAX_CHAT_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('invalid base64url')
    const json = base64urlDecode(value)
    if (base64urlEncode(json) !== value) throw new Error('non-canonical base64url')
    const cursor = schema.parse(JSON.parse(json))
    if (JSON.stringify(cursor) !== json) throw new Error('non-canonical json')
    return cursor
  } catch { throw new Error('INVALID_CURSOR') }
}
export function encodeChatConversationCursor(cursor: ChatConversationCursor): string { return base64urlEncode(JSON.stringify(ChatConversationCursorSchema.parse(cursor))) }
export function decodeChatConversationCursor(value: string): ChatConversationCursor { return decodeChatCursor(value, ChatConversationCursorSchema) }
export function encodeChatMessageCursor(cursor: ChatMessageCursor): string { return base64urlEncode(JSON.stringify(ChatMessageCursorSchema.parse(cursor))) }
export function decodeChatMessageCursor(value: string): ChatMessageCursor { return decodeChatCursor(value, ChatMessageCursorSchema) }

export type ChatIpIdentity = z.infer<typeof ChatIpIdentitySchema>
export type ChatConversationSummary = z.infer<typeof ChatConversationSummarySchema>
export type ChatConversationPage = z.infer<typeof ChatConversationPageSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatHistoryPage = z.infer<typeof ChatHistoryPageSchema>
export type ChatConversationCreateInput = z.infer<typeof ChatConversationCreateInputSchema>
export type ChatSendInput = z.infer<typeof ChatSendInputSchema>
export type ChatSendResponse = z.infer<typeof ChatSendResponseSchema>
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>
export type ChatConversationCursor = z.infer<typeof ChatConversationCursorSchema>
export type ChatMessageCursor = z.infer<typeof ChatMessageCursorSchema>
