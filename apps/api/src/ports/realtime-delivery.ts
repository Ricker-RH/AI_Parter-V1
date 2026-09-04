import {randomUUID} from 'node:crypto'
import type {RealtimeEvent} from '@aifans/contracts'
import type {RealtimePublisher} from '../adapters/realtime-publisher.js'

export type RealtimeOutboxItem={id:string;eventId:string;attemptCount:number;recipientProfileIds:string[];event:RealtimeEvent}
export type RealtimeOutboxPort={
  claim(input:{leaseToken:string;limit:number;leaseSeconds:number}):Promise<RealtimeOutboxItem[]>
  acknowledge(id:string,leaseToken:string):Promise<boolean>
  retry(id:string,leaseToken:string,code:string,retrySeconds:number):Promise<boolean>
}
export function createRealtimeDeliveryWorker({outbox,publisher}:{outbox:RealtimeOutboxPort;publisher:RealtimePublisher}) {
  return {
    async deliverBatch(requestedLimit:number) {
      if(!Number.isSafeInteger(requestedLimit)||requestedLimit<1) throw new Error('Invalid realtime batch size')
      const leaseToken=randomUUID()
      const rows=await outbox.claim({leaseToken,limit:Math.min(10,requestedLimit),leaseSeconds:60})
      const summary={claimed:rows.length,delivered:0,retried:0}
      // Small concurrency bound keeps each 2-recipient send below its lease;
      // failures remain persisted for retry with the same event identity.
      for(let offset=0;offset<rows.length;offset+=5) {
        await Promise.all(rows.slice(offset,offset+5).map(async row=>{
          try {
            for(const recipient of new Set(row.recipientProfileIds)) await publisher.publish(recipient,row.event)
            if(await outbox.acknowledge(row.id,leaseToken)) summary.delivered++
          } catch {
            const retrySeconds=Math.min(300,5*2**Math.min(6,Math.max(0,row.attemptCount)))
            if(await outbox.retry(row.id,leaseToken,'provider_unavailable',retrySeconds)) summary.retried++
          }
        }))
      }
      return summary
    },
  }
}
export type RealtimeDeliveryWorker=ReturnType<typeof createRealtimeDeliveryWorker>
