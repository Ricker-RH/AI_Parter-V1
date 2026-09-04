import {Hono} from 'hono'
import {describe,it,expect,vi} from 'vitest'
import {realtimeDeliveryMiddleware} from './realtime-delivery.js'
describe('post-commit realtime dispatch',()=>{
  it('defers delivery only after a successful human command',async()=>{
    const deferred:Promise<unknown>[]=[]
    const deliverBatch=vi.fn(async()=>({claimed:1,delivered:1,retried:0}))
    const app=new Hono()
    app.use('*',realtimeDeliveryMiddleware({realtimeDelivery:{deliverBatch},defer:promise=>{deferred.push(promise)}}))
    app.post('/v1/human-chat/peers/p/messages',c=>c.json({persisted:true}))
    app.post('/v1/human-chat/peers/p/read',c=>c.json({blocked:true},403))
    expect((await app.request('/v1/human-chat/peers/p/messages',{method:'POST'})).status).toBe(200)
    expect(deferred).toHaveLength(1)
    await Promise.all(deferred)
    expect(deliverBatch).toHaveBeenCalledWith(10)
    await app.request('/v1/human-chat/peers/p/read',{method:'POST'})
    expect(deliverBatch).toHaveBeenCalledOnce()
  })
  it('does not turn a persisted command into failure when delivery fails',async()=>{
    const app=new Hono()
    app.use('*',realtimeDeliveryMiddleware({realtimeDelivery:{deliverBatch:vi.fn().mockRejectedValue(new Error('provider unavailable'))}}))
    app.put('/v1/humans/p/block',c=>c.json({changed:true}))
    expect((await app.request('/v1/humans/p/block',{method:'PUT'})).status).toBe(200)
  })
})
