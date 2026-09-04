import {HumanMessageSchema, HumanSendInputSchema, HumanReadInputSchema, type HumanMessage} from '@aifans/contracts'
import {z} from 'zod'
import type {Actor, WithActor} from './session.js'

const uuid = z.uuid()
const safeSequence = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const HistoryInput = z.strictObject({conversationId: uuid, afterSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), limit: z.number().int().min(1).max(100)})
const SendInput = HumanSendInputSchema.extend({peerProfileId: uuid})
const ReadInput = HumanReadInputSchema.extend({conversationId: uuid})

function message(row: Record<string, unknown>): HumanMessage {
  return HumanMessageSchema.parse({
    v: 1, id: row.id, conversationId: row.conversation_id, senderProfileId: row.sender_profile_id,
    clientRequestId: row.client_request_id, sequence: safeSequence.parse(row.sequence), content: row.content,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  })
}

export function createHumanChatRepository({withActor}: {withActor: WithActor}) {
  return {
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
          FROM public.human_dm_messages WHERE conversation_id = $1 AND sequence > $2 ORDER BY sequence ASC LIMIT $3`,
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
