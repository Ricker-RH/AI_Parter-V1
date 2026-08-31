import {z} from 'zod'
import {LocaleSchema} from './account.js'

const uuid = z.uuid()

export const ChatMessageInputSchema = z.strictObject({
  message: z.string().trim().min(1).max(4000),
  conversationId: uuid.optional(),
  locale: LocaleSchema.optional(),
})

export const ChatMessageResponseSchema = z.strictObject({
  answer: z.string(),
  conversationId: uuid,
  messageId: uuid,
  createdAt: z.iso.datetime().optional(),
})

export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>
export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>
