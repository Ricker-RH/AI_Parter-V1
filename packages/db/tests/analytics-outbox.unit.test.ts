import {describe, expect, it, vi} from 'vitest'
import {createPooledAnalyticsOutboxRepository} from '../src/analytics-outbox.js'
import type {QueryClient, QueryPool} from '../src/session.js'

describe('pooled analytics outbox repository', () => {
  it('checks out and releases a database client for each operation', async () => {
    const release = vi.fn()
    const query = vi.fn(async () => ({rows: [], rowCount: 0}))
    const client = {query, release} as unknown as QueryClient
    const pool = {connect: vi.fn(async () => client)} satisfies QueryPool
    const repository = createPooledAnalyticsOutboxRepository(pool)

    await expect(repository.claim({leaseToken: 'ff99f929-2a14-4321-8851-eea0584424ab', limit: 2, leaseSeconds: 60})).resolves.toEqual([])
    expect(pool.connect).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases the client when a database operation fails', async () => {
    const release = vi.fn()
    const client = {query: async () => { throw new Error('database unavailable') }, release} as unknown as QueryClient
    const repository = createPooledAnalyticsOutboxRepository({connect: async () => client})
    await expect(repository.acknowledge('0d305f68-38f8-4e06-8205-4ed276479fcd', '124a5f12-2986-41dd-adf7-708d982227f5')).rejects.toThrow('database unavailable')
    expect(release).toHaveBeenCalledOnce()
  })
})
