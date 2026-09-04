import {describe,it,expect,vi} from 'vitest'
import {createRealtimePublisher} from './realtime-publisher.js'

const profileId='00000000-0000-4000-8000-000000000001'
const event={v:1 as const,eventId:crypto.randomUUID(),conversationId:crypto.randomUUID(),occurredAt:new Date().toISOString(),type:'typing' as const,profileId,isTyping:true}
describe('trusted realtime publisher',()=>{
  it('posts a validated event to the configured gateway without following redirects',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:204}))
    const publisher=createRealtimePublisher({baseUrl:'https://realtime.example',secret:'s'.repeat(32),fetcher})
    await publisher.publish(profileId,event)
    const [url,options]=fetcher.mock.calls[0]!
    expect(url).toBe(`https://realtime.example/internal/events/${profileId}`)
    expect(options).toMatchObject({method:'POST',redirect:'error',headers:{authorization:`Bearer ${'s'.repeat(32)}`,'content-type':'application/json'},body:JSON.stringify(event)})
    expect(options!.signal).toBeInstanceOf(AbortSignal)
  })
  it('rejects unsafe configuration and untrusted payloads before network access',async()=>{
    for(const baseUrl of ['http://gateway.example','https://user:pass@gateway.example','https://gateway.example/path','https://gateway.example?token=x']) expect(()=>createRealtimePublisher({baseUrl,secret:'s'.repeat(32)})).toThrow('Invalid realtime publisher configuration')
    for(const secret of [' '.repeat(32),` ${'s'.repeat(32)}`,`${'s'.repeat(32)} `]) expect(()=>createRealtimePublisher({baseUrl:'https://gateway.example',secret})).toThrow('Invalid realtime publisher configuration')
    const fetcher=vi.fn<typeof fetch>()
    const publisher=createRealtimePublisher({baseUrl:'https://realtime.example',secret:'s'.repeat(32),fetcher})
    await expect(publisher.publish('not-uuid',event)).rejects.toThrow()
    await expect(publisher.publish(profileId,{...event,v:2} as never)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('returns only a safe delivery error on network or provider failure',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('secret sensitive upstream')).mockResolvedValueOnce(new Response('private upstream details',{status:503}))
    const publisher=createRealtimePublisher({baseUrl:'https://realtime.example',secret:'s'.repeat(32),fetcher})
    await expect(publisher.publish(profileId,event)).rejects.toThrow('Realtime delivery unavailable')
    await expect(publisher.publish(profileId,event)).rejects.toThrow('Realtime delivery unavailable')
  })
})
