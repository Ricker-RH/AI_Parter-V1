import type {Locale} from '@aifans/contracts'

export type ProviderChatDelta = {type: 'delta'; delta: string}

export type ProviderChatResult = {
  answer: string
  providerConversationId: string
  providerMessageId: string
}

export type SendChatMessageInput = {
  humanProfileId: string
  ipProfileId: string
  message: string
  providerConversationId?: string
  locale: Locale
  requestId: string
  signal?: AbortSignal
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
