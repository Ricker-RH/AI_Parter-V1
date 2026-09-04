import type {MiddlewareHandler} from 'hono'
import type {RealtimeDeliveryWorker} from '../ports/realtime-delivery.js'

export function realtimeDeliveryMiddleware(dependencies:{realtimeDelivery?:RealtimeDeliveryWorker;defer?:(promise:Promise<unknown>)=>void}):MiddlewareHandler {
  return async(c,next)=>{
    await next()
    if(!dependencies.realtimeDelivery||c.res.status>=300||!['POST','PUT','DELETE'].includes(c.req.method)||!/^\/v1\/(?:human-chat|humans)\//.test(c.req.path)) return
    // Persistence has already succeeded. Failed wakeups leave the durable
    // outbox for the scheduled drain, without misreporting the command result.
    const delivery=dependencies.realtimeDelivery.deliverBatch(10).catch(()=>undefined)
    if(dependencies.defer) dependencies.defer(delivery)
    else await delivery
  }
}
