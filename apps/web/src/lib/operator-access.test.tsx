import {describe, expect, it, vi} from 'vitest'
import {getOperatorPageAccess} from './operator-access.js'

describe('operator page access', () => {
  it.each([
    [204, 'operator'],
    [401, 'anonymous'],
    [403, 'forbidden'],
    [503, 'unavailable'],
  ] as const)('maps API status %s to %s', async (status, expected) => {
    const fetcher = vi.fn(async () => new Response(null, {status}))

    await expect(getOperatorPageAccess(fetcher)).resolves.toBe(expected)
    expect(fetcher).toHaveBeenCalledWith('/v1/admin/access')
  })

  it('fails closed when the access check is unavailable', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline') })

    await expect(getOperatorPageAccess(fetcher)).resolves.toBe('unavailable')
  })
})
