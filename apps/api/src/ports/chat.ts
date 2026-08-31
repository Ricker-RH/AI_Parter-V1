import type {ChatMessageResponse, Locale} from '@aifans/contracts'

export type SendChatMessageInput = {
  humanProfileId: string
  ipProfileId: string
  message: string
  conversationId?: string
  locale: Locale
  requestId: string
}

export type ChatPort = {
  sendMessage(input: SendChatMessageInput): Promise<ChatMessageResponse>
}

export class ChatProviderError extends Error {
  constructor(cause?: unknown) {
    super('Chat provider request failed', {cause})
    this.name = 'ChatProviderError'
  }
}
