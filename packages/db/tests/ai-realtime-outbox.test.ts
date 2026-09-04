import {describe,it,expect,vi} from 'vitest'
import {createPostgresAiRealtimeOutboxRepository} from '../src/ai-realtime-outbox.js'
const id='edc5b166-125d-4af3-ac8c-233a773f66c1'
describe('AI transition outbox repository',()=>{
 it('reconciles bounded stale work before claiming ID-only single-owner events',async()=>{
  const event={v:1,type:'ai_generation',eventId:id,conversationId:id,messageId:id,state:'failed',occurredAt:'2026-09-04T10:00:00Z'}
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('claim_ai')?[{id,attempt_count:1,recipient_profile_ids:[id],event}]:[{value:true}],rowCount:1}))
  const repository=createPostgresAiRealtimeOutboxRepository({withPlatformActor:async(actor,fn)=>{expect(actor.subject).toBe('__ai_realtime_delivery__');return fn({query,release(){}} as never)}})
  expect(await repository.claim({leaseToken:id,limit:10,leaseSeconds:60})).toEqual([{id,eventId:id,attemptCount:1,recipientProfileIds:[id],event}])
  expect(query.mock.calls[0]?.[0]).toContain('reconcile_stale_ai_generations(20)')
  await repository.acknowledge(id,id);expect(query.mock.calls.at(-1)?.[0]).toContain('acknowledge_ai_realtime_outbox')
 })
})
