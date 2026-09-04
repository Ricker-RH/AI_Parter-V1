import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchAifansApi}=vi.hoisted(()=>({fetchAifansApi:vi.fn()}))
vi.mock('../../../../lib/server-api.js',()=>({fetchAifansApi}))
import {GET} from './route.js'
const id='22222222-2222-4222-8222-222222222222'

describe('notification detail read proxy',()=>{
  beforeEach(()=>fetchAifansApi.mockReset())
  it('rejects malformed identities before contacting the upstream service',async()=>{
    const response=await GET(new Request('https://web.example/api/notifications/bad'),{params:Promise.resolve({notificationId:'bad'})})
    expect(response.status).toBe(400)
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })
  it('keeps unauthenticated responses private',async()=>{
    fetchAifansApi.mockResolvedValueOnce(new Response(null,{status:401}))
    const response=await GET(new Request(`https://web.example/api/notifications/${id}`),{params:Promise.resolve({notificationId:id})})
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
