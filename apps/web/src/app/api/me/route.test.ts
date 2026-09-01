import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../lib/server-api.js', () => ({fetchAifansApi: vi.fn()}))

import {fetchAifansApi} from '../../../lib/server-api.js'
import {GET, PATCH} from './route.js'

const account = {
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30', kind: 'human', username: 'rui',
  displayName: 'Rui', bio: null, preferredLocale: 'en', creatorModeEnabled: false,
}

afterEach(() => vi.clearAllMocks())

describe('/api/me proxy', () => {
  it('forwards GET account data without caching', async () => {
    vi.mocked(fetchAifansApi).mockResolvedValue(Response.json(account))
    const response = await GET(new Request('https://web.example/api/me'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(account)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('forwards an origin-checked PATCH body and upstream status', async () => {
    vi.mocked(fetchAifansApi).mockResolvedValue(Response.json(account))
    const response = await PATCH(new Request('https://web.example/api/me', {
      method: 'PATCH', headers: {origin: 'https://web.example', 'content-type': 'application/json'},
      body: JSON.stringify({displayName: 'Rui'}),
    }))
    expect(response.status).toBe(200)
    expect(fetchAifansApi).toHaveBeenCalledWith('/v1/me', expect.objectContaining({requestInit: expect.objectContaining({method: 'PATCH', body: '{"displayName":"Rui"}'})}))
  })

  it('rejects cross-origin, malformed, oversized, and duplicate-key patches', async () => {
    const crossOrigin = await PATCH(new Request('https://web.example/api/me', {method: 'PATCH', headers: {origin: 'https://evil.example'}}))
    expect(crossOrigin.status).toBe(403)
    const malformed = await PATCH(new Request('https://web.example/api/me', {method: 'PATCH', headers: {origin: 'https://web.example', 'content-type': 'text/plain'}, body: 'x'}))
    expect(malformed.status).toBe(422)
    const duplicate = await PATCH(new Request('https://web.example/api/me', {method: 'PATCH', headers: {origin: 'https://web.example', 'content-type': 'application/json'}, body: '{"bio":"one","bio":"two"}'}))
    expect(duplicate.status).toBe(422)
    const oversized = await PATCH(new Request('https://web.example/api/me', {method: 'PATCH', headers: {origin: 'https://web.example', 'content-type': 'application/json', 'content-length': '70000'}, body: '{}'}))
    expect(oversized.status).toBe(413)
  })
})
