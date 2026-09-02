import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchAifansApi} = vi.hoisted(() => ({fetchAifansApi: vi.fn()}))
vi.mock('../../../../lib/server-api.js', () => ({fetchAifansApi}))

import {GET} from './route.js'

describe('GET /api/search/suggestions', () => {
  beforeEach(() => fetchAifansApi.mockReset())

  it('proxies one normalized bounded query to the existing anonymous limited search', async () => {
    fetchAifansApi.mockResolvedValue(Response.json({items: [], nextCursor: null}))
    const request = new Request('https://web.example/api/search/suggestions?q=%20%20luna%20%20moon%20')

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(fetchAifansApi).toHaveBeenCalledWith('/v1/search?q=luna+moon&category=all&limit=8', expect.objectContaining({
      requestInit: expect.objectContaining({method: 'GET', signal: request.signal}),
      trustedClientHeaders: request.headers,
    }))
  })

  it.each([
    'https://web.example/api/search/suggestions',
    'https://web.example/api/search/suggestions?q=',
    'https://web.example/api/search/suggestions?q=a&q=b',
    'https://web.example/api/search/suggestions?q=luna&cursor=opaque',
    `https://web.example/api/search/suggestions?q=${'x'.repeat(81)}`,
  ])('rejects an empty, duplicate, unknown, or oversized query without reaching upstream', async (url) => {
    const response = await GET(new Request(url))
    expect(response.status).toBe(400)
    expect(fetchAifansApi).not.toHaveBeenCalled()
  })

  it('converts upstream failure into the existing safe unavailable response', async () => {
    fetchAifansApi.mockResolvedValue({status: 503, headers: new Headers(), arrayBuffer: async () => {throw new Error('network unavailable')}})
    const response = await GET(new Request('https://web.example/api/search/suggestions?q=luna'))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({code: 'SOCIAL_UNAVAILABLE'})
  })
})
