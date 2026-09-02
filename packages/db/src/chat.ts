import {
  ChatBodySchema,
  ChatConversationPageSchema,
  ChatConversationSummarySchema,
  ChatHistoryPageSchema,
  ChatMessageSchema,
  ChatSendResponseSchema,
  decodeChatConversationCursor,
  decodeChatMessageCursor,
  encodeChatConversationCursor,
  encodeChatMessageCursor,
  type ChatConversationPage,
  type ChatConversationSummary,
  type ChatHistoryPage,
  type ChatMessage,
  type ChatSendResponse,
} from '@aifans/contracts'
import {z} from 'zod'
import type {Actor, QueryClient, WithActor} from './session.js'
import {withActor} from './session.js'

const ProviderIdSchema = z.string().min(1).max(512)
const MessageLimitSchema = z.number().int().min(1).max(100)

type ConversationRow = {
  id: string
  ip_profile_id: string
  username: string
  display_name: string
  updated_at: Date | string
  last_body: string | null
  last_role: 'human' | 'assistant' | null
  last_created_at: Date | string | null
}
type MessageRow = {
  id: string
  role: 'human' | 'assistant'
  body: string
  delivery_state: 'pending' | 'sent' | 'failed'
  created_at: Date | string
  client_request_id?: string
  human_profile_id?: string
  ip_profile_id?: string
  provider_conversation_id?: string | null
}

export type ChatRepository = {
  listConversations(actor: Actor, input: {limit: number; cursor?: string; sendEnabled: boolean}): Promise<ChatConversationPage>
  getOrCreateConversation(actor: Actor, input: {humanProfileId: string; ipProfileId: string; sendEnabled: boolean}): Promise<ChatConversationSummary | null>
  getConversation(actor: Actor, input: {conversationId: string; sendEnabled: boolean}): Promise<ChatConversationSummary | null>
  listMessages(actor: Actor, input: {conversationId: string; limit: number; cursor?: string; sendEnabled: boolean}): Promise<ChatHistoryPage | null>
  beginHumanMessage(actor: Actor, input: {conversationId: string; requestId: string; body: string}): Promise<BeginHumanMessageResult | null>
  completeProviderReply(actor: Actor, input: CompleteProviderReplyInput): Promise<ChatSendResponse | null>
  failHumanMessage(actor: Actor, input: {conversationId: string; humanMessageId: string}): Promise<boolean>
}

export type BeginHumanMessageResult =
  | {type: 'ready'; humanProfileId: string; ipProfileId: string; providerConversationId?: string; humanMessage: ChatMessage}
  | {type: 'complete'; response: ChatSendResponse}
  | {type: 'inflight'}
  | {type: 'conflict'}

export type CompleteProviderReplyInput = {
  conversationId: string
  humanMessageId: string
  answer: string
  providerConversationId: string
  providerMessageId: string
}

const utcTimestamp = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

function conversationProjection({sentOnly = false}: {sentOnly?: boolean} = {}) { return `
SELECT conversation.id, conversation.ip_profile_id, ip.username, ip.display_name, ${utcTimestamp('conversation.updated_at')} AS updated_at,
  last_message.body AS last_body, last_message.role AS last_role, last_message.created_at AS last_created_at
FROM public.chat_conversations conversation
JOIN public.profiles ip ON ip.id = conversation.ip_profile_id
${sentOnly ? 'JOIN' : 'LEFT JOIN'} LATERAL (
  SELECT body, role, ${utcTimestamp('created_at')} AS created_at
  FROM public.chat_messages
  WHERE conversation_id = conversation.id
  ${sentOnly ? "AND delivery_state = 'sent'" : ''}
  ORDER BY created_at DESC, id DESC
  LIMIT 1
) last_message ON TRUE` }

function iso(value: Date | string): string {
  return typeof value === 'string' ? z.iso.datetime().parse(value) : value.toISOString()
}
function message(row: MessageRow): ChatMessage {
  return ChatMessageSchema.parse({
    id: row.id,
    role: row.role,
    body: row.body,
    deliveryState: row.delivery_state,
    createdAt: iso(row.created_at),
  })
}
function conversation(row: ConversationRow, sendEnabled: boolean): ChatConversationSummary {
  return ChatConversationSummarySchema.parse({
    id: row.id,
    ipProfile: {id: row.ip_profile_id, username: row.username, displayName: row.display_name},
    lastMessage: row.last_body === null || row.last_role === null || row.last_created_at === null
      ? null
      : {body: row.last_body, role: row.last_role, createdAt: iso(row.last_created_at)},
    updatedAt: iso(row.updated_at),
    sendEnabled,
  })
}
async function getConversationFromClient(client: QueryClient, conversationId: string, sendEnabled: boolean): Promise<ChatConversationSummary | null> {
  const result = await client.query<ConversationRow>(`${conversationProjection()}
WHERE conversation.id = $1::uuid`, [conversationId])
  const row = result.rows[0]
  return row ? conversation(row, sendEnabled) : null
}
function limit(value: number): number { return MessageLimitSchema.parse(value) }

export function createChatRepository(runWithActor: WithActor = withActor): ChatRepository {
  return {
    async listConversations(actor, input) {
      const take = limit(input.limit)
      const cursor = input.cursor ? decodeChatConversationCursor(input.cursor) : null
      return runWithActor(actor, async (client) => {
        const result = await client.query<ConversationRow>(`${conversationProjection({sentOnly: true})}
WHERE ($1::timestamptz IS NULL OR (conversation.updated_at, conversation.id) < ($1::timestamptz, $2::uuid))
ORDER BY conversation.updated_at DESC, conversation.id DESC
LIMIT $3`, [cursor?.updatedAt ?? null, cursor?.id ?? null, take + 1])
        const rows = result.rows.slice(0, take)
        const last = rows.at(-1)
        return ChatConversationPageSchema.parse({
          items: rows.map((row) => conversation(row, input.sendEnabled)),
          nextCursor: result.rows.length > take && last
            ? encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: iso(last.updated_at), id: last.id})
            : null,
        })
      })
    },

    async getOrCreateConversation(actor, input) {
      return runWithActor(actor, async (client) => {
        await client.query(
          `INSERT INTO public.chat_conversations (human_profile_id, ip_profile_id)
           VALUES ($1::uuid, $2::uuid)
           ON CONFLICT (human_profile_id, ip_profile_id) DO NOTHING`,
          [input.humanProfileId, input.ipProfileId],
        )
        const result = await client.query<ConversationRow>(`${conversationProjection()}
WHERE conversation.human_profile_id = $1::uuid AND conversation.ip_profile_id = $2::uuid`, [input.humanProfileId, input.ipProfileId])
        const row = result.rows[0]
        return row ? conversation(row, input.sendEnabled) : null
      })
    },

    getConversation: (actor, input) => runWithActor(actor, (client) => getConversationFromClient(client, input.conversationId, input.sendEnabled)),

    async listMessages(actor, input) {
      const take = limit(input.limit)
      const cursor = input.cursor ? decodeChatMessageCursor(input.cursor) : null
      return runWithActor(actor, async (client) => {
        const current = await getConversationFromClient(client, input.conversationId, input.sendEnabled)
        if (!current) return null
        const result = await client.query<MessageRow>(
          `SELECT id, role, body, delivery_state, ${utcTimestamp('created_at')} AS created_at
           FROM public.chat_messages
           WHERE conversation_id = $1::uuid
             AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
           ORDER BY created_at DESC, id DESC
           LIMIT $4`,
          [input.conversationId, cursor?.createdAt ?? null, cursor?.id ?? null, take + 1],
        )
        const newestFirst = result.rows.slice(0, take)
        const oldest = newestFirst.at(-1)
        return ChatHistoryPageSchema.parse({
          conversation: current,
          items: newestFirst.reverse().map(message),
          nextCursor: result.rows.length > take && oldest
            ? encodeChatMessageCursor({v: 1, kind: 'chat-messages', createdAt: iso(oldest.created_at), id: oldest.id})
            : null,
        })
      })
    },

    async beginHumanMessage(actor, input) {
      const body = ChatBodySchema.parse(input.body)
      return runWithActor(actor, async (client) => {
        const inserted = await client.query<{id: string}>(
          `INSERT INTO public.chat_messages (conversation_id, role, body, delivery_state, client_request_id)
           VALUES ($1::uuid, 'human', $3, 'pending', $2::uuid)
           ON CONFLICT (conversation_id, client_request_id) DO NOTHING
           RETURNING id`,
          [input.conversationId, input.requestId, body],
        )
        const existing = await client.query<MessageRow>(
          `SELECT message.id, message.role, message.body, message.delivery_state, ${utcTimestamp('message.created_at')} AS created_at,
             message.client_request_id, conversation.human_profile_id, conversation.ip_profile_id, conversation.provider_conversation_id
           FROM public.chat_messages message
           JOIN public.chat_conversations conversation ON conversation.id = message.conversation_id
           WHERE message.conversation_id = $1::uuid AND message.client_request_id = $2::uuid AND message.role = 'human'
           FOR UPDATE OF message`,
          [input.conversationId, input.requestId],
        )
        const human = existing.rows[0]
        if (!human) return null
        if (human.body !== body) return {type: 'conflict' as const}
        if (human.delivery_state === 'pending') {
          if (inserted.rows.length === 0) return {type: 'inflight' as const}
          await client.query(
            'UPDATE public.chat_conversations SET updated_at = clock_timestamp() WHERE id = $1::uuid',
            [input.conversationId],
          )
          return {
            type: 'ready' as const,
            humanProfileId: human.human_profile_id!, ipProfileId: human.ip_profile_id!,
            ...(human.provider_conversation_id ? {providerConversationId: human.provider_conversation_id} : {}),
            humanMessage: message(human),
          }
        }
        if (human.delivery_state === 'failed') {
          const retried = await client.query<MessageRow>(
            `UPDATE public.chat_messages SET delivery_state = 'pending' WHERE id = $1::uuid AND delivery_state = 'failed'
             RETURNING id, role, body, delivery_state, ${utcTimestamp('created_at')} AS created_at`,
            [human.id],
          )
          const current = retried.rows[0]
          if (!current) return {type: 'inflight' as const}
          await client.query(
            'UPDATE public.chat_conversations SET updated_at = clock_timestamp() WHERE id = $1::uuid',
            [input.conversationId],
          )
          return {
            type: 'ready' as const,
            humanProfileId: human.human_profile_id!, ipProfileId: human.ip_profile_id!,
            ...(human.provider_conversation_id ? {providerConversationId: human.provider_conversation_id} : {}),
            humanMessage: message(current),
          }
        }
        const reply = await client.query<MessageRow>(
          `SELECT id, role, body, delivery_state, ${utcTimestamp('created_at')} AS created_at
           FROM public.chat_messages
           WHERE conversation_id = $1::uuid AND in_reply_to_client_request_id = $2::uuid
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [input.conversationId, input.requestId],
        )
        const assistant = reply.rows[0]
        if (!assistant) throw new Error('CHAT_COMPLETION_MISSING')
        return {type: 'complete' as const, response: ChatSendResponseSchema.parse({humanMessage: message(human), assistantMessage: message(assistant)})}
      })
    },

    async completeProviderReply(actor, input) {
      const answer = ChatBodySchema.parse(input.answer)
      const providerConversationId = ProviderIdSchema.parse(input.providerConversationId)
      const providerMessageId = ProviderIdSchema.parse(input.providerMessageId)
      return runWithActor(actor, async (client) => {
        const locked = await client.query<MessageRow>(
          `SELECT message.id, message.role, message.body, message.delivery_state, ${utcTimestamp('message.created_at')} AS created_at, message.client_request_id,
             conversation.human_profile_id, conversation.ip_profile_id, conversation.provider_conversation_id
           FROM public.chat_messages message
           JOIN public.chat_conversations conversation ON conversation.id = message.conversation_id
           WHERE message.id = $1::uuid AND message.conversation_id = $2::uuid
             AND message.role = 'human' AND message.delivery_state = 'pending'
           FOR UPDATE OF message, conversation`,
          [input.humanMessageId, input.conversationId],
        )
        const pending = locked.rows[0]
        if (!pending) return null
        const sentHuman = await client.query<MessageRow>(
          `UPDATE public.chat_messages SET delivery_state = 'sent' WHERE id = $1::uuid AND delivery_state = 'pending'
           RETURNING id, role, body, delivery_state, ${utcTimestamp('created_at')} AS created_at`,
          [pending.id],
        )
        const human = sentHuman.rows[0]
        if (!human) return null
        const insertedAssistant = await client.query<MessageRow>(
          `INSERT INTO public.chat_messages (conversation_id, role, body, delivery_state, in_reply_to_client_request_id, provider_message_id)
           VALUES ($1::uuid, 'assistant', $2, 'sent', $3::uuid, $4)
           ON CONFLICT (conversation_id, in_reply_to_client_request_id) DO NOTHING
           RETURNING id, role, body, delivery_state, ${utcTimestamp('created_at')} AS created_at`,
          [input.conversationId, answer, pending.client_request_id, providerMessageId],
        )
        const assistant = insertedAssistant.rows[0]
        if (!assistant) throw new Error('CHAT_COMPLETION_CONFLICT')
        await client.query(
          'UPDATE public.chat_conversations SET provider_conversation_id = $1 WHERE id = $2::uuid',
          [providerConversationId, input.conversationId],
        )
        return ChatSendResponseSchema.parse({humanMessage: message(human), assistantMessage: message(assistant)})
      })
    },

    async failHumanMessage(actor, input) {
      return runWithActor(actor, async (client) => {
        const result = await client.query<{id: string}>(
          `UPDATE public.chat_messages SET delivery_state = 'failed'
           WHERE id = $1::uuid AND conversation_id = $2::uuid
             AND role = 'human' AND delivery_state = 'pending'
           RETURNING id`,
          [input.humanMessageId, input.conversationId],
        )
        return result.rows.length === 1
      })
    },
  }
}
