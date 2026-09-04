import {expect, it, vi} from 'vitest'
import {createApp} from '../application.js'

it('fails closed when profile cleanup is not configured', async () => {
  expect((await createApp().request('/internal/profile-assets/cleanup', {method: 'POST'})).status).toBe(503)
})

it('authenticates cleanup, accepts no client-supplied deletion scope, and runs one bounded batch', async () => {
  const run = vi.fn(async () => ({processed: 2, deleted: 3, failed: 0}))
  const app = createApp({profileAssetCleanup: {run}, profileAssetCleanupSecret: 'x'.repeat(32)})
  expect((await app.request('/internal/profile-assets/cleanup', {method: 'POST'})).status).toBe(401)
  const headers = {authorization: `Bearer ${'x'.repeat(32)}`}
  expect((await app.request('/internal/profile-assets/cleanup?limit=999', {method: 'POST', headers})).status).toBe(400)
  expect((await app.request('/internal/profile-assets/cleanup', {method: 'POST', headers, body: '{}'})).status).toBe(422)
  expect(run).not.toHaveBeenCalled()
  const response = await app.request('/internal/profile-assets/cleanup', {method: 'POST', headers})
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({processed: 2, deleted: 3, failed: 0})
  expect(run).toHaveBeenCalledExactlyOnceWith()
})
