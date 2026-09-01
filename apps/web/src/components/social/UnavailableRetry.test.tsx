import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

const {routerRefresh, transition} = vi.hoisted(() => ({
  routerRefresh: vi.fn(),
  transition: {pending: false, start: vi.fn((callback: () => void) => callback())},
}))

vi.mock('next/navigation', () => ({useRouter: () => ({refresh: routerRefresh})}))
vi.mock('react', async () => ({...(await vi.importActual<typeof import('react')>('react')), useTransition: () => [transition.pending, transition.start] as const}))

import {UnavailableRetry} from './UnavailableRetry.js'

describe('UnavailableRetry', () => {
  it('re-enables after a refresh leaves the unavailable result mounted', () => {
    routerRefresh.mockReset()
    transition.start.mockClear()
    transition.pending = false
    const {rerender} = render(<UnavailableRetry label="Retry" pendingLabel="Retrying…" />)

    fireEvent.click(screen.getByRole('button', {name: 'Retry'}))
    expect(transition.start).toHaveBeenCalledOnce()
    expect(routerRefresh).toHaveBeenCalledOnce()

    transition.pending = true
    rerender(<UnavailableRetry label="Retry" pendingLabel="Retrying…" />)
    expect(screen.getByRole('button', {name: 'Retrying…'})).toBeDisabled()

    transition.pending = false
    rerender(<UnavailableRetry label="Retry" pendingLabel="Retrying…" />)
    expect(screen.getByRole('button', {name: 'Retry'})).toBeEnabled()

    fireEvent.click(screen.getByRole('button', {name: 'Retry'}))
    expect(routerRefresh).toHaveBeenCalledTimes(2)
  })
})
