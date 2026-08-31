import {beforeEach, describe, expect, it, vi} from 'vitest'

const handler = vi.fn()
vi.mock('../../../../lib/auth/server.js', () => ({
  createConfiguredNeonAuth: vi.fn(() => null),
}))

import {createConfiguredNeonAuth} from '../../../../lib/auth/server.js'
import {GET, POST} from './route.js'

beforeEach(() => {
  vi.mocked(createConfiguredNeonAuth).mockReturnValue(null)
  handler.mockReset()
})

describe('Neon Auth same-origin handler', () => {
  it('returns a safe not-configured response when credentials are absent', async () => {
    const response = await GET(new Request('https://web.example/api/auth/get-session'), {params: Promise.resolve({path: ['get-session']})})
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({code: 'AUTH_NOT_CONFIGURED'})
  })

  it('delegates auth requests to the official Neon handler', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, {status: 204}))
    vi.mocked(createConfiguredNeonAuth).mockReturnValue({handler: () => ({GET: upstream, POST: upstream})} as never)
    const context = {params: Promise.resolve({path: ['sign-in', 'email']})}
    const request = new Request('https://web.example/api/auth/sign-in/email', {method: 'POST'})
    expect((await POST(request, context)).status).toBe(204)
    expect(upstream).toHaveBeenCalledWith(request, context)
  })
})
