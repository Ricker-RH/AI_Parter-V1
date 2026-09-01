import {ChatBodySchema, type Locale} from '@aifans/contracts'
import {z} from 'zod'

export const MAX_PROVIDER_ANSWER_LENGTH = 4000
export const MAX_PROVIDER_ID_LENGTH = 512
export const ProviderChatDeltaSchema = z.strictObject({type: z.literal('delta'), delta: ChatBodySchema})
export const ProviderChatResultSchema = z.strictObject({
  answer: ChatBodySchema,
  providerConversationId: z.string().min(1).max(MAX_PROVIDER_ID_LENGTH),
  providerMessageId: z.string().min(1).max(MAX_PROVIDER_ID_LENGTH),
})

export type ProviderChatDelta = z.infer<typeof ProviderChatDeltaSchema>
export type ProviderChatResult = z.infer<typeof ProviderChatResultSchema>

export type SendChatMessageInput = {
  humanProfileId: string
  ipProfileId: string
  message: string
  providerConversationId?: string
  locale: Locale
  requestId: string
  signal: AbortSignal
}

export type ChatPort = {
  streamMessage(input: SendChatMessageInput): AsyncGenerator<ProviderChatDelta, ProviderChatResult>
}

export class ChatProviderError extends Error {
  constructor(_cause?: unknown) {
    super('Chat provider request failed')
    this.name = 'ChatProviderError'
  }
}
