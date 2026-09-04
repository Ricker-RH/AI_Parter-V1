import type {RealtimeDeliveryWorker} from './realtime-delivery.js'

/** Independent durable streams: a failed claim must not starve the other stream. */
export function groupRealtimeDeliveryWorkers(workers:readonly RealtimeDeliveryWorker[]):RealtimeDeliveryWorker {
 return {async deliverBatch(limit){
  const results=await Promise.allSettled(workers.map(worker=>worker.deliverBatch(limit)))
  if(results.some(result=>result.status==='rejected')) throw new Error('Realtime delivery incomplete')
  return results.reduce((sum,result)=>result.status==='fulfilled'?{
   claimed:sum.claimed+result.value.claimed,delivered:sum.delivered+result.value.delivered,retried:sum.retried+result.value.retried,
  }:sum,{claimed:0,delivered:0,retried:0})
 }}
}
