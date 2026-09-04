import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchAifansApi}=vi.hoisted(()=>({fetchAifansApi:vi.fn()}))
vi.mock('../../../lib/server-api.js',()=>({fetchAifansApi}))
import {GET} from './route.js'

describe('notification list read proxy',()=>{
  beforeEach(()=>fetchAifansApi.mockReset())
  it('validates the notification page and keeps it private',async()=>{
    fetchAifansApi.mockResolvedValueOnce(Response.json({items:[],nextCursor:null}))
    const response=await GET(new Request('https://web.example/api/notifications'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(fetchAifansApi).toHaveBeenCalledWith('/v1/notifications',expect.objectContaining({policy:'private-cache'}))
  })
  it('does not contact the upstream service for malformed queries',async()=>{
    const response=await GET(new Request('https://web.example/api/notifications?cursor=bad!'))
    expect(response.status).toBe(400)
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })
})
