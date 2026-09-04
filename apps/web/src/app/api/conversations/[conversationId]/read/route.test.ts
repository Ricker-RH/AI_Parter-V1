import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../../../lib/auth/server.js',()=>({getApiBearerToken:vi.fn(async()=> 'signed-jwt')}))
import * as route from './route.js'

const id='22222222-2222-4222-8222-222222222222'
const conversation={id,ipProfile:{id:'11111111-1111-4111-8111-111111111111',username:'luma',displayName:'Luma'},lastMessage:null,updatedAt:'2026-09-01T01:00:00.000Z',sendEnabled:true,unreadCount:0}
const context=(value=id)=>({params:Promise.resolve({conversationId:value})})
const request=(url=`https://web.example/api/conversations/${id}/read`,headers:HeadersInit={})=>new Request(url,{method:'POST',headers:{origin:'https://web.example',...headers}})

afterEach(()=>{vi.unstubAllGlobals();delete process.env.AIFANS_API_URL})

describe('IP conversation read proxy',()=>{
  it('forwards a same-origin read beacon as private owner-scoped JSON',async()=>{
    process.env.AIFANS_API_URL='https://internal.example'
    const upstream=vi.fn().mockResolvedValue(Response.json(conversation,{headers:{'x-request-id':'upstream-id','cache-control':'public, max-age=86400'}}))
    vi.stubGlobal('fetch',upstream)
    const response=await route.POST(request(),context())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(conversation)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(upstream.mock.calls[0]?.[0]).toBe(`https://internal.example/v1/chat/conversations/${id}/read`)
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({method:'POST'})
  })

  it.each([
    [request(undefined,{origin:'https://evil.example'}),context(),403],
    [request(`https://web.example/api/conversations/${id}/read?forged=1`),context(),400],
    [request(),context('not-a-uuid'),404],
  ])('rejects malformed read requests before upstream access',async(input,ctx,status)=>{
    process.env.AIFANS_API_URL='https://internal.example'
    const upstream=vi.fn()
    vi.stubGlobal('fetch',upstream)
    expect((await route.POST(input,ctx)).status).toBe(status)
    expect(upstream).not.toHaveBeenCalled()
  })
})
