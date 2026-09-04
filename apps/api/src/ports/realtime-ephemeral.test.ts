import {expect,it,vi} from 'vitest'
import {createRealtimeEphemeral} from './realtime-ephemeral.js'
const profileId='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222',conversationId='33333333-3333-4333-8333-333333333333'
const input={subject:'a',profileId,sessionId:profileId,conversationId,type:'typing' as const,isTyping:true}
it('derives recipients only from fresh authoritative resolver, never request identity fields',async()=>{
 const resolve=vi.fn(async()=>peer),status=vi.fn(async()=>false)
 const port=createRealtimeEphemeral({resolve,status})
 expect((await port.emit(input)).deliveries).toEqual([{recipientProfileId:peer,event:expect.objectContaining({profileId,conversationId,type:'typing',isTyping:true})}])
 expect(resolve).toHaveBeenCalledWith({...input,allowExpired:false})
 resolve.mockResolvedValue(null as never)
 expect(await port.emit(input)).toEqual({deliveries:[]})
 expect(status).not.toHaveBeenCalled()
})
it('returns actual online peer snapshot only after permission, and bounds offline grace flag to lifecycle',async()=>{
 const resolve=vi.fn(async()=>peer),status=vi.fn(async()=>false)
 const port=createRealtimeEphemeral({resolve,status})
 const online={subject:'a',profileId,sessionId:profileId,conversationId,type:'presence' as const,status:'online' as const,snapshot:true}
 const result=await port.emit(online)
 expect(result.deliveries[1]).toEqual({recipientProfileId:profileId,event:expect.objectContaining({profileId:peer,status:'offline'})})
 expect(status).toHaveBeenCalledWith(peer,conversationId)
 await port.emit({...online,status:'offline',snapshot:false})
 expect(resolve).toHaveBeenLastCalledWith(expect.objectContaining({allowExpired:true}))
})
