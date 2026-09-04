import {AiRealtimeEventSchema, type AiRealtimeEvent} from '@aifans/contracts'
import {z} from 'zod'
import type {QueryClient, WithPlatformActor} from './session.js'

const uuid = z.uuid()
const claimOptions = z.strictObject({leaseToken:uuid,limit:z.number().int().min(1).max(100),leaseSeconds:z.number().int().min(1).max(3600)})
const errorCode = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
export type AiRealtimeOutboxEvent = {id:string;eventId:string;attemptCount:number;recipientProfileIds:[string];event:AiRealtimeEvent}
export type AiRealtimeOutboxRepository = ReturnType<typeof createAiRealtimeOutboxRepository>

/** Server-only client: SQL accepts only the trusted platform role. */
export function createAiRealtimeOutboxRepository(client: QueryClient) {
  const complete = async (sql:string,values:unknown[]):Promise<boolean> => (await client.query(sql,values)).rows[0]?.value===true
  return {
    async claim(input:z.infer<typeof claimOptions>):Promise<AiRealtimeOutboxEvent[]> {
      const value=claimOptions.parse(input)
      await client.query('SELECT public.reconcile_stale_ai_generations(20)')
      const result=await client.query('SELECT * FROM public.claim_ai_realtime_outbox($1,$2,$3)',[value.leaseToken,value.limit,value.leaseSeconds])
      const events:AiRealtimeOutboxEvent[]=[]
      for(const row of result.rows) {
        const id=uuid.parse(row.id)
        try {
          const event=AiRealtimeEventSchema.parse(row.event)
          const recipientProfileIds=z.tuple([uuid]).parse(row.recipient_profile_ids)
          if(event.eventId!==id || event.type!=='ai_generation') throw new Error('INVALID_DURABLE_EVENT')
          events.push({id,eventId:id,event,recipientProfileIds,attemptCount:z.number().int().min(1).max(10).parse(row.attempt_count)})
        } catch {
          await complete('SELECT public.fail_ai_realtime_outbox($1,$2,$3) AS value',[id,value.leaseToken,'invalid_payload'])
        }
      }
      return events
    },
    acknowledge:(id:string,leaseToken:string)=>complete('SELECT public.acknowledge_ai_realtime_outbox($1,$2) AS value',[uuid.parse(id),uuid.parse(leaseToken)]),
    retry:(id:string,leaseToken:string,code:string,retrySeconds:number)=>complete('SELECT public.retry_ai_realtime_outbox($1,$2,$3,$4) AS value',[uuid.parse(id),uuid.parse(leaseToken),errorCode.parse(code),z.number().int().min(1).max(86400).parse(retrySeconds)]),
    fail:(id:string,leaseToken:string,code:string)=>complete('SELECT public.fail_ai_realtime_outbox($1,$2,$3) AS value',[uuid.parse(id),uuid.parse(leaseToken),errorCode.parse(code)]),
  }
}

/** Each claim/ack/retry executes in an isolated trusted database transaction. */
export function createPostgresAiRealtimeOutboxRepository({withPlatformActor}:{withPlatformActor:WithPlatformActor}):AiRealtimeOutboxRepository {
  const run=<T>(operation:(repository:AiRealtimeOutboxRepository)=>Promise<T>):Promise<T>=>
    withPlatformActor({subject:'__ai_realtime_delivery__'},client=>operation(createAiRealtimeOutboxRepository(client)))
  return {
    claim:input=>run(repo=>repo.claim(input)),
    acknowledge:(id,leaseToken)=>run(repo=>repo.acknowledge(id,leaseToken)),
    retry:(id,leaseToken,code,retrySeconds)=>run(repo=>repo.retry(id,leaseToken,code,retrySeconds)),
    fail:(id,leaseToken,code)=>run(repo=>repo.fail(id,leaseToken,code)),
  }
}
