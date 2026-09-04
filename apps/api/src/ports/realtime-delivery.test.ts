import {describe,it,expect,vi} from 'vitest'
import {createRealtimeDeliveryWorker} from './realtime-delivery.js'

const peer='00000000-0000-4000-8000-000000000001',sender='00000000-0000-4000-8000-000000000002'
const row={id:crypto.randomUUID(),eventId:crypto.randomUUID(),attemptCount:1,recipientProfileIds:[peer,sender],event:{v:1 as const,eventId:crypto.randomUUID(),conversationId:crypto.randomUUID(),occurredAt:new Date().toISOString(),type:'read' as const,profileId:peer,lastReadSequence:1}}
function fixture(){return {claim:vi.fn().mockResolvedValue([row]),acknowledge:vi.fn().mockResolvedValue(true),retry:vi.fn().mockResolvedValue(true),fail:vi.fn().mockResolvedValue(true)}}
describe('durable realtime delivery',()=>{
  it('acknowledges only after both recipient and sender delivery',async()=>{
    const outbox=fixture(),publish=vi.fn().mockResolvedValue(undefined)
    const result=await createRealtimeDeliveryWorker({outbox,publisher:{publish}}).deliverBatch(10)
    expect(publish.mock.calls.map(call=>call[0])).toEqual([peer,sender])
    expect(outbox.acknowledge).toHaveBeenCalledWith(row.id,expect.any(String))
    expect(result).toEqual({claimed:1,delivered:1,retried:0})
  })
  it('retains durable retry if either recipient fails; never reports delivery',async()=>{
    const outbox=fixture(),publish=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('provider secret'))
    const result=await createRealtimeDeliveryWorker({outbox,publisher:{publish}}).deliverBatch(10)
    expect(outbox.acknowledge).not.toHaveBeenCalled()
    expect(outbox.retry).toHaveBeenCalledWith(row.id,expect.any(String),'provider_unavailable',expect.any(Number))
    expect(result).toEqual({claimed:1,delivered:0,retried:1})
  })
  it('bounds batch sizes before claiming',async()=>{
    const outbox=fixture()
    const worker=createRealtimeDeliveryWorker({outbox,publisher:{publish:vi.fn()}})
    await expect(worker.deliverBatch(NaN)).rejects.toThrow('Invalid realtime batch size')
    expect(outbox.claim).not.toHaveBeenCalled()
    await worker.deliverBatch(1000)
    expect(outbox.claim).toHaveBeenCalledWith(expect.objectContaining({limit:10,leaseSeconds:60}))
  })
})
