import {it,expect,vi} from 'vitest'
import {groupRealtimeDeliveryWorkers} from './realtime-delivery-group.js'

it('drains both durable streams and preserves the surviving stream on failure',async()=>{
 const human={deliverBatch:vi.fn(async()=>({claimed:2,delivered:1,retried:1}))}
 const ai={deliverBatch:vi.fn(async()=>({claimed:1,delivered:1,retried:0}))}
 expect(await groupRealtimeDeliveryWorkers([human,ai]).deliverBatch(10)).toEqual({claimed:3,delivered:2,retried:1})
 expect(ai.deliverBatch).toHaveBeenCalledWith(10)
 const broken={deliverBatch:async()=>{throw new Error('database unavailable')}}
 await expect(groupRealtimeDeliveryWorkers([human,broken]).deliverBatch(10)).rejects.toThrow('Realtime delivery incomplete')
 expect(human.deliverBatch).toHaveBeenCalledTimes(2)
})
