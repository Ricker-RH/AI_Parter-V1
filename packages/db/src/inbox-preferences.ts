import {z} from 'zod'
import type {Actor,WithActor} from './session.js'

const inputSchema=z.strictObject({kind:z.enum(['HUMAN','IP']),conversationId:z.uuid(),action:z.enum(['pin','unpin','delete'])})
const itemSchema=z.object({kind:z.enum(['HUMAN','IP']),conversationId:z.uuid(),pinnedAt:z.iso.datetime().nullable(),deletedAt:z.iso.datetime().nullable()})
export function createInboxPreferencesRepository({withActor}:{withActor:WithActor}) {
  return {
    async list(actor:Actor) {
      return withActor(actor,async client=>{
        const result=await client.query(`SELECT kind,conversation_id AS "conversationId",
          to_char(pinned_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "pinnedAt",
          to_char(deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "deletedAt"
          FROM public.inbox_preferences WHERE profile_id=public.current_profile_id()`)
        return {items:result.rows.map(row=>itemSchema.parse(row))}
      })
    },
    async mutate(actor:Actor,input:z.infer<typeof inputSchema>) {
      const value=inputSchema.parse(input)
      await withActor(actor,async client=>{
        await client.query('SELECT public.mutate_inbox_preference($1,$2::uuid,$3)',[value.kind,value.conversationId,value.action])
      })
    },
  }
}
export type InboxPreferencesRepository=ReturnType<typeof createInboxPreferencesRepository>
