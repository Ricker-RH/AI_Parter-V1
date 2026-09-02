import {fireEvent, render, screen, within} from '@testing-library/react'
import type {FormHTMLAttributes, ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {SearchComposer} from './SearchComposer.js'

const {push} = vi.hoisted(() => ({push: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({push})}))
vi.mock('next/form', () => ({default: ({children, ...props}: FormHTMLAttributes<HTMLFormElement> & {children: ReactNode}) => <form {...props}>{children}</form>}))

const profile = {
  kind: 'ip' as const,
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
  username: 'luna_ip',
  displayName: 'Luna',
  bio: 'A quiet moonlit storyteller.',
  languages: ['en' as const],
  visualType: 'anime' as const,
}

describe('SearchComposer', () => {
  beforeEach(() => {vi.useFakeTimers(); push.mockReset()})
  afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals()})

  it('debounces suggestions, exposes a real IP option, and supports keyboard selection', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({items: [{type: 'profile', profile}], nextCursor: null}))
    vi.stubGlobal('fetch', request)
    render(<SearchComposer labels={{input: 'Search AI/IP profiles and posts', submit: 'Search', suggestions: 'Search suggestions'}} locale="en"/>)
    const input = screen.getByRole('combobox', {name: 'Search AI/IP profiles and posts'})

    fireEvent.change(input, {target: {value: 'lu'}})
    expect(request).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    await vi.runAllTimersAsync()

    expect(request).toHaveBeenCalledWith('/api/search/suggestions?q=lu', expect.objectContaining({credentials: 'same-origin', signal: expect.any(AbortSignal)}))
    const listbox = screen.getByRole('listbox', {name: 'Search suggestions'})
    expect(within(listbox).getByRole('option', {name: 'Search for “lu”'})).toBeVisible()
    expect(within(listbox).getByRole('option', {name: 'Luna @luna_ip'})).toBeVisible()

    fireEvent.keyDown(input, {key: 'ArrowDown'})
    fireEvent.keyDown(input, {key: 'ArrowDown'})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(push).toHaveBeenCalledWith(`/en/profiles/${profile.id}`)
  })

  it('aborts an obsolete request and never paints its late response over the new query', async () => {
    let resolveFirst!: (response: Response) => void
    const request = vi.fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => {resolveFirst = resolve}))
      .mockResolvedValueOnce(Response.json({items: [], nextCursor: null}))
    vi.stubGlobal('fetch', request)
    render(<SearchComposer labels={{input: 'Search', submit: 'Search', suggestions: 'Search suggestions'}} locale="en"/>)
    const input = screen.getByRole('combobox', {name: 'Search'})

    fireEvent.change(input, {target: {value: 'lu'}})
    await vi.advanceTimersByTimeAsync(250)
    const firstSignal = request.mock.calls[0]![1].signal as AbortSignal
    fireEvent.change(input, {target: {value: 'luna'}})
    await vi.advanceTimersByTimeAsync(250)
    expect(firstSignal.aborted).toBe(true)

    resolveFirst(Response.json({items: [{type: 'profile', profile}], nextCursor: null}))
    await vi.runAllTimersAsync()
    expect(screen.queryByRole('option', {name: 'Luna @luna_ip'})).toBeNull()
  })
})
