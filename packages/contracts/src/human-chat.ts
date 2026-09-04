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
