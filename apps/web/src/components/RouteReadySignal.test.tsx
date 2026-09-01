import {act, render} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

let pathname = '/en'
vi.mock('next/navigation', () => ({usePathname: () => pathname, useSearchParams: () => new URLSearchParams()}))

import {RouteReadySignal} from './RouteReadySignal.js'

describe('RouteReadySignal', () => {
  it('emits its destination generation when the cold skeleton is removed', async () => {
    const ready = vi.fn()
    document.addEventListener('aifans:route-ready', ready)
    const view = render(<><RouteReadySignal content="home"/><main>Home route</main></>)
    ready.mockClear()

    pathname = '/en/messages'
    view.rerender(<><RouteReadySignal content="destination"/><main>Previous route</main><main className="route-skeleton">Loading</main></>)

    view.rerender(<><RouteReadySignal content="destination"/><main>Destination route</main></>)
    await act(async () => { await Promise.resolve() })

    expect(ready).toHaveBeenCalledWith(expect.objectContaining({detail: {generation: 2, route: '/en/messages'}}))
    document.removeEventListener('aifans:route-ready', ready)
    pathname = '/en'
  })
})
