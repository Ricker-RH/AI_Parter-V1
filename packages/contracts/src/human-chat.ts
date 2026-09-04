import {z} from 'zod'
import {HumanIdentitySchema} from './human-social.js'

const uuid = z.uuid()
const dateTime = z.iso.datetime()
const readSequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const HumanMessageContentSchema = z.discriminatedUnion('kind', [
  z.strictObject({kind: z.literal('text'), text: z.string().max(4000).trim().min(1)}),
  z.strictObject({kind: z.literal('image'), attachmentId: uuid}),
  z.strictObject({kind: z.literal('voice'), attachmentId: uuid}),
  z.strictObject({kind: z.literal('sticker'), stickerId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_:-]*$/)}),
  z.strictObject({kind: z.literal('share'), target: z.strictObject({kind: z.enum(['post', 'human', 'ip']), id: uuid})}),
])
export const HumanConversationSchema = z.strictObject({
  v: z.literal(1),
  id: uuid,
  participants: z.tuple([HumanIdentitySchema, HumanIdentitySchema]).refine(([a, b]) => a.id.toLowerCase() !== b.id.toLowerCase(), {message: 'Participants must be distinct'}),
  createdAt: dateTime,
  updatedAt: dateTime,
})
export const HumanMessageSchema = z.strictObject({
  v: z.literal(1),
  id: uuid,
  conversationId: uuid,
  senderProfileId: uuid,
  clientRequestId: uuid,
  sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  createdAt: dateTime,
  content: HumanMessageContentSchema,
})
// Sender and conversation identity come from the authenticated request context.
export const HumanSendInputSchema = z.strictObject({clientRequestId: uuid, content: HumanMessageContentSchema})
export const HumanConversationCreateInputSchema = z.strictObject({peerProfileId: uuid})
export const HumanReadInputSchema = z.strictObject({lastReadSequence: readSequence})
export const HumanReadCursorSchema = z.strictObject({conversationId: uuid, profileId: uuid, lastReadSequence: readSequence})
// A single cursor cannot prove monotonicity. The persistence layer must compare
// against its stored cursor atomically; this schema validates that comparison.
export const HumanReadAdvanceSchema = z.strictObject({previousSequence: readSequence, nextSequence: readSequence})
  .refine((value) => value.nextSequence >= value.previousSequence, {message: 'Read cursor cannot move backwards'})
const eventBase = {v: z.literal(1), eventId: uuid, conversationId: uuid, occurredAt: dateTime}
export const HumanRealtimeEventSchema = z.discriminatedUnion('type', [
  z.strictObject({...eventBase, type: z.literal('message'), message: HumanMessageSchema}),
  z.strictObject({...eventBase, type: z.literal('read'), profileId: uuid, lastReadSequence: readSequence}),
  z.strictObject({...eventBase, type: z.literal('typing'), profileId: uuid, isTyping: z.boolean()}),
  z.strictObject({...eventBase, type: z.literal('presence'), profileId: uuid, status: z.enum(['online', 'offline'])}),
  z.strictObject({...eventBase, type: z.literal('access_revoked'), reason: z.enum(['blocked', 'account_unavailable', 'membership_revoked'])}),
]).refine((event) => event.type !== 'message' || event.conversationId === event.message.conversationId, {message: 'Event and message conversation must match'})

export type HumanMessageContent = z.infer<typeof HumanMessageContentSchema>
export type HumanConversation = z.infer<typeof HumanConversationSchema>
export type HumanMessage = z.infer<typeof HumanMessageSchema>
export type HumanSendInput = z.infer<typeof HumanSendInputSchema>
export type HumanConversationCreateInput = z.infer<typeof HumanConversationCreateInputSchema>
export type HumanReadInput = z.infer<typeof HumanReadInputSchema>
export type HumanReadCursor = z.infer<typeof HumanReadCursorSchema>
export type HumanReadAdvance = z.infer<typeof HumanReadAdvanceSchema>
export type HumanRealtimeEvent = z.infer<typeof HumanRealtimeEventSchema>

const HumanInboxCursorValueSchema = z.strictObject({v: z.literal(1), updatedAt: dateTime, id: uuid})
const inboxAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function encodeInboxText(text: string): string {
  let bits = 0, value = 0, result = ''
  for (const character of text) {
    value = (value << 8) | character.charCodeAt(0); bits += 8
    while (bits >= 6) {bits -= 6; result += inboxAlphabet[(value >>> bits) & 63]}
  }
  if (bits) result += inboxAlphabet[(value << (6 - bits)) & 63]
  return result
}
function decodeInboxText(text: string): string {
  let bits = 0, value = 0, result = ''
  for (const character of text) {
    value = (value << 6) | inboxAlphabet.indexOf(character); bits += 6
    if (bits >= 8) {bits -= 8; result += String.fromCharCode((value >>> bits) & 255)}
  }
  if (encodeInboxText(result) !== text) throw new Error('INVALID_HUMAN_INBOX_CURSOR')
  return result
}
export function decodeHumanInboxCursor(cursor: string): z.infer<typeof HumanInboxCursorValueSchema> {
  if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('INVALID_HUMAN_INBOX_CURSOR')
  try {return HumanInboxCursorValueSchema.parse(JSON.parse(decodeInboxText(cursor)))}
  catch {throw new Error('INVALID_HUMAN_INBOX_CURSOR')}
}
export function encodeHumanInboxCursor(value: z.infer<typeof HumanInboxCursorValueSchema>): string {
  return encodeInboxText(JSON.stringify(HumanInboxCursorValueSchema.parse(value)))
}
export const HumanInboxCursorSchema = z.string().min(1).max(512).refine(value => {
  try {decodeHumanInboxCursor(value); return true} catch {return false}
})
export const HumanInboxItemSchema = z.strictObject({
  conversation: HumanConversationSchema,
  latestMessage: HumanMessageSchema.nullable(),
  unreadCount: readSequence,
  lastReadSequence: readSequence,
}).refine(value => value.latestMessage === null || (value.latestMessage.conversationId === value.conversation.id && value.conversation.participants.some(person => person.id === value.latestMessage!.senderProfileId)), {message: 'Inbox message must belong to conversation participants'})
export const HumanInboxPageSchema = z.strictObject({items: z.array(HumanInboxItemSchema).max(100), nextCursor: HumanInboxCursorSchema.nullable()})
export type HumanInboxPage = z.infer<typeof HumanInboxPageSchema>
