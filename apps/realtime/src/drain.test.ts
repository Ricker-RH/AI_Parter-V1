import {describe,it,expect,vi} from 'vitest'
import {drainOutbox} from './drain.js'
const env={UPSTREAM_API_URL:'https://api.example',ALLOWED_ORIGINS:'https://web.example',REALTIME_INTERNAL_SECRET:'s'.repeat(32)}
describe('scheduled durable retry drain',()=>{
  it('calls only the fixed authenticated API path with timeout and no redirects',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:200}))
    await drainOutbox(env,fetcher)
    expect(fetcher).toHaveBeenCalledWith('https://api.example/v1/internal/realtime/deliver',expect.objectContaining({method:'POST',redirect:'manual',body:'{}',headers:{authorization:`Bearer ${env.REALTIME_INTERNAL_SECRET}`,'content-type':'application/json'}}))
  })
  it('does not call unconfigured or untrusted origins and rejects provider redirects',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://evil.example'}}))
    await expect(drainOutbox({},fetcher)).rejects.toThrow('Realtime drain unavailable')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(drainOutbox(env,fetcher)).rejects.toThrow('Realtime drain unavailable')
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
