import type {
  ChatConversationPage,
  ChatConversationSummary,
  ChatHistoryPage,
  ChatMessage,
  ChatSendResponse,
} from '@aifans/contracts'

export type ChatRepositoryActor = {subject: string}

export type BeginHumanMessageResult =
  | {type: 'ready'; humanProfileId: string; ipProfileId: string; providerConversationId?: string; humanMessage: ChatMessage}
  | {type: 'complete'; response: ChatSendResponse}
  | {type: 'inflight'}
  | {type: 'failed'}
  | {type: 'conflict'}

export type CompleteProviderReplyInput = {
  conversationId: string
  humanMessageId: string
  answer: string
  providerConversationId: string
  providerMessageId: string
}

export type ChatRepositoryPort = {
  listConversations(actor: ChatRepositoryActor, input: {limit: number; cursor?: string; sendEnabled: boolean}): Promise<ChatConversationPage>
  getOrCreateConversation(actor: ChatRepositoryActor, input: {humanProfileId: string; ipProfileId: string; sendEnabled: boolean}): Promise<ChatConversationSummary | null>
  getConversation(actor: ChatRepositoryActor, input: {conversationId: string; sendEnabled: boolean}): Promise<ChatConversationSummary | null>
  listMessages(actor: ChatRepositoryActor, input: {conversationId: string; limit: number; cursor?: string; sendEnabled: boolean}): Promise<ChatHistoryPage | null>
  beginHumanMessage(actor: ChatRepositoryActor, input: {conversationId: string; requestId: string; body: string}): Promise<BeginHumanMessageResult | null>
  completeProviderReply(actor: ChatRepositoryActor, input: CompleteProviderReplyInput): Promise<ChatSendResponse | null>
  failHumanMessage(actor: ChatRepositoryActor, input: {conversationId: string; humanMessageId: string}): Promise<boolean>
  checkpointProviderReply?(actor:ChatRepositoryActor,input:{conversationId:string;humanMessageId:string;answer:string}):Promise<boolean>
}
