import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchAifansApi}=vi.hoisted(()=>({fetchAifansApi:vi.fn()}))
vi.mock('../../../lib/server-api.js',()=>({fetchAifansApi}))

import {GET} from './route.js'

describe('feed read proxy',()=>{
  beforeEach(()=>fetchAifansApi.mockReset())
  it('validates the cacheable feed response and keeps browser responses private',async()=>{
    fetchAifansApi.mockResolvedValueOnce(Response.json({items:[],nextCursor:null}))
    const response=await GET(new Request('https://web.example/api/feed?kind=for_you&locale=en'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({items:[],nextCursor:null})
    expect(fetchAifansApi).toHaveBeenCalledWith('/v1/feed?kind=for_you&locale=en',expect.objectContaining({policy:'private-cache'}))
  })

  it('rejects malformed feed queries before contacting the upstream service',async()=>{
    const response=await GET(new Request('https://web.example/api/feed?kind=for_you&kind=following&locale=en'))
    expect(response.status).toBe(400)
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })
})
