import {HumanMessageSchema, HumanSendInputSchema, HumanReadInputSchema, HumanConversationSchema, HumanConversationCreateInputSchema, HumanInboxCursorSchema, HumanInboxPageSchema, HumanIdentitySchema, decodeHumanInboxCursor, encodeHumanInboxCursor, type HumanMessage, type HumanConversation, type HumanInboxPage} from '@aifans/contracts'
import {z} from 'zod'
import type {Actor, WithActor} from './session.js'

const uuid = z.uuid()
const safeSequence = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const HistoryInput = z.strictObject({conversationId: uuid, afterSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), limit: z.number().int().min(1).max(100)})
const SendInput = HumanSendInputSchema.extend({peerProfileId: uuid})
const ReadInput = HumanReadInputSchema.extend({conversationId: uuid})
const ListInput = z.strictObject({limit: z.number().int().min(1).max(100), cursor: HumanInboxCursorSchema.optional()})

// The public profile projection exposes no auth/email columns; conversation and
// message rows remain protected by participant RLS even with a forged cursor.
const ConversationProjection = `SELECT c.id,
  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(c.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  jsonb_build_object('id',lo.id,'username',lo.username,'displayName',lo.display_name,'avatarKey',lo.avatar_object_key) AS low_identity,
  jsonb_build_object('id',hi.id,'username',hi.username,'displayName',hi.display_name,'avatarKey',hi.avatar_object_key) AS high_identity
  FROM public.human_dm_conversations c
  CROSS JOIN LATERAL public.human_public_profile(c.low_profile_id) lo
  CROSS JOIN LATERAL public.human_public_profile(c.high_profile_id) hi`

const InboxProjection = ConversationProjection.replace('FROM public.human_dm_conversations c', `,
  (SELECT jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sender_profile_id',m.sender_profile_id,
    'client_request_id',m.client_request_id,'sequence',m.sequence::text,'content',m.content,
    'created_at',to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    FROM public.human_dm_messages m WHERE m.conversation_id=c.id AND m.sequence > coalesce((SELECT deleted_sequence FROM public.inbox_preferences WHERE kind='HUMAN' AND conversation_id=c.id AND profile_id=public.current_profile_id()),0) ORDER BY m.sequence DESC LIMIT 1) AS latest_message,
  (SELECT count(*)::text FROM public.human_dm_messages unread WHERE unread.conversation_id=c.id
    AND unread.sequence > coalesce((SELECT read_sequence FROM public.human_dm_members WHERE conversation_id=c.id AND profile_id=public.current_profile_id()),0)
    AND unread.sequence > coalesce((SELECT deleted_sequence FROM public.inbox_preferences WHERE kind='HUMAN' AND conversation_id=c.id AND profile_id=public.current_profile_id()),0)
    AND unread.sender_profile_id <> public.current_profile_id()) AS unread_count,
  coalesce((SELECT read_sequence::text FROM public.human_dm_members WHERE conversation_id=c.id AND profile_id=public.current_profile_id()),'0') AS read_sequence
  FROM public.human_dm_conversations c`)

function message(row: Record<string, unknown>): HumanMessage {
  return HumanMessageSchema.parse({
    v: 1, id: row.id, conversationId: row.conversation_id, senderProfileId: row.sender_profile_id,
    clientRequestId: row.client_request_id, sequence: safeSequence.parse(row.sequence), content: row.content,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  })
}

export function createHumanChatRepository({withActor, publicMediaBaseUrl}: {withActor: WithActor; publicMediaBaseUrl?: string}) {
  let mediaBase: URL | undefined
  if (publicMediaBaseUrl) {
    mediaBase = new URL(publicMediaBaseUrl)
    if (mediaBase.protocol !== 'https:' || mediaBase.username || mediaBase.password || mediaBase.search || mediaBase.hash) throw new Error('INVALID_PUBLIC_MEDIA_BASE_URL')
    if (!mediaBase.pathname.endsWith('/')) mediaBase.pathname += '/'
  }
  function identity(value: unknown) {
    const row = z.strictObject({id: uuid, username: z.string(), displayName: z.string(), avatarKey: z.string().nullable()}).parse(value)
    let avatarUrl: string | null = null
    if (row.avatarKey !== null) {
      if (!new RegExp(`^public/profiles/${row.id}/avatar/[0-9a-f-]+\\.webp$`).test(row.avatarKey)) throw new Error('INVALID_PUBLIC_MEDIA_KEY')
      if (!mediaBase) throw new Error('PUBLIC_MEDIA_BASE_URL_REQUIRED')
      avatarUrl = new URL(row.avatarKey, mediaBase).toString()
    }
    return HumanIdentitySchema.parse({kind: 'HUMAN', id: row.id, username: row.username, displayName: row.displayName, avatarUrl})
  }
  function conversation(row: Record<string, unknown>): HumanConversation {
    return HumanConversationSchema.parse({v: 1, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, participants: [identity(row.low_identity), identity(row.high_identity)]})
  }
  return {
    async open(actor: Actor, input: {peerProfileId: string}): Promise<HumanConversation> {
      const value = HumanConversationCreateInputSchema.parse(input)
      return withActor(actor, async client => {
        const opened = await client.query('SELECT id FROM public.human_dm_open($1)', [value.peerProfileId])
        const id = uuid.parse(opened.rows[0]?.id)
        const result = await client.query(`${ConversationProjection} WHERE c.id = $1`, [id])
        if (!result.rows[0]) throw Object.assign(new Error('HUMAN_CONVERSATION_NOT_FOUND'), {code: 'P0002'})
        return conversation(result.rows[0])
      })
    },
    async list(actor: Actor, input: z.infer<typeof ListInput>): Promise<HumanInboxPage> {
      const value = ListInput.parse(input)
      const cursor = value.cursor ? decodeHumanInboxCursor(value.cursor) : null
      return withActor(actor, async client => {
        const result = await client.query(`${InboxProjection}
          WHERE NOT EXISTS (SELECT 1 FROM public.inbox_preferences pref WHERE pref.kind='HUMAN' AND pref.conversation_id=c.id AND pref.profile_id=public.current_profile_id() AND pref.deleted_at IS NOT NULL AND c.last_sequence <= pref.deleted_sequence)
          AND ($1::timestamptz IS NULL OR (c.updated_at,c.id) < ($1::timestamptz,$2::uuid))
          ORDER BY c.updated_at DESC, c.id DESC LIMIT $3`, [cursor?.updatedAt ?? null, cursor?.id ?? null, value.limit + 1])
        const rows = result.rows.slice(0, value.limit)
        const items = rows.map(row => ({conversation: conversation(row), latestMessage: row.latest_message === null ? null : message(z.record(z.string(), z.unknown()).parse(row.latest_message)), unreadCount: safeSequence.parse(row.unread_count), lastReadSequence: safeSequence.parse(row.read_sequence)}))
        const last = items.at(-1)
        return HumanInboxPageSchema.parse({items, nextCursor: result.rows.length > value.limit && last ? encodeHumanInboxCursor({v: 1, updatedAt: last.conversation.updatedAt, id: last.conversation.id}) : null})
      })
    },
    async send(actor: Actor, input: z.infer<typeof SendInput>): Promise<HumanMessage> {
      const value = SendInput.parse(input)
      return withActor(actor, async (client) => {
        const result = await client.query('SELECT * FROM public.human_dm_send($1,$2::jsonb,$3)', [value.peerProfileId, JSON.stringify(value.content), value.clientRequestId])
        if (!result.rows[0]) throw new Error('HUMAN_MESSAGE_NOT_SAVED')
        return message(result.rows[0])
      })
    },
    async history(actor: Actor, input: z.infer<typeof HistoryInput>): Promise<HumanMessage[]> {
      const value = HistoryInput.parse(input)
      return withActor(actor, async (client) => {
        // FORCE RLS resolves membership independently of this parameterized query.
        const result = await client.query(`SELECT id,conversation_id,sender_profile_id,client_request_id,sequence,content,created_at
          FROM public.human_dm_messages WHERE conversation_id = $1 AND sequence > $2 AND sequence > coalesce((SELECT deleted_sequence FROM public.inbox_preferences WHERE kind='HUMAN' AND conversation_id=$1 AND profile_id=public.current_profile_id()),0) ORDER BY sequence ASC LIMIT $3`,
        [value.conversationId, value.afterSequence, value.limit])
        return result.rows.map(message)
      })
    },
    async markRead(actor: Actor, input: z.infer<typeof ReadInput>): Promise<number> {
      const value = ReadInput.parse(input)
      return withActor(actor, async (client) => {
        const result = await client.query('SELECT public.human_dm_mark_read($1,$2) AS read_sequence', [value.conversationId, value.lastReadSequence])
        if (!result.rows[0]) throw new Error('HUMAN_READ_NOT_SAVED')
        return safeSequence.parse(result.rows[0].read_sequence)
      })
    },
  }
}

export type HumanChatRepository = ReturnType<typeof createHumanChatRepository>
