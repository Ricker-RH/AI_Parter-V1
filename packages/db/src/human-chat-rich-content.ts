import {HumanShareTargetQuerySchema,HumanShareTargetSchema,HumanShareTargetPageSchema,HumanShareResolutionSchema,type HumanShareTargetQuery,type HumanShareTarget} from '@aifans/contracts'
import type {Actor,WithActor} from './session.js'
export function createHumanChatRichContentRepository({withActor}:{withActor:WithActor}){
 return {
  async listTargets(actor:Actor,input:HumanShareTargetQuery){
   const value=HumanShareTargetQuerySchema.parse(input)
   return withActor(actor,async c=>HumanShareTargetPageSchema.parse({items:(await c.query('SELECT public.human_dm_share_targets($1,$2,$3) AS card',[value.kind,value.q,value.limit])).rows.map(row=>row.card)}))
  },
  async resolveTarget(actor:Actor,input:HumanShareTarget){
   const value=HumanShareTargetSchema.parse(input)
   return withActor(actor,async c=>HumanShareResolutionSchema.parse((await c.query('SELECT public.human_dm_resolve_share($1,$2) AS resolution',[value.kind,value.id])).rows[0]?.resolution))
  },
 }
}
export type HumanChatRichContentRepository=ReturnType<typeof createHumanChatRichContentRepository>
