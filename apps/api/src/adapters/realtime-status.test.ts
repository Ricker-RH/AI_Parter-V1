import {expect,it,vi} from 'vitest'
import {createRealtimeStatusReader} from './realtime-status.js'
const id='11111111-1111-4111-8111-111111111111'
it('reads bounded authenticated authoritative status and throws rather than fabricating offline',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({online:true})).mockResolvedValueOnce(Response.json({online:'yes'})).mockResolvedValueOnce(new Response('x'.repeat(2049)))
 const reader=createRealtimeStatusReader({baseUrl:'https://realtime.example',secret:'s'.repeat(32),fetcher})
 expect(await reader(id,id)).toBe(true)
 expect(fetcher).toHaveBeenCalledWith(`https://realtime.example/internal/status/${id}`,expect.objectContaining({method:'POST',redirect:'error',body:JSON.stringify({conversationId:id})}))
 await expect(reader(id,id)).rejects.toThrow();await expect(reader(id,id)).rejects.toThrow()
 expect(()=>createRealtimeStatusReader({baseUrl:'http://bad',secret:'s'.repeat(32)})).toThrow()
})
