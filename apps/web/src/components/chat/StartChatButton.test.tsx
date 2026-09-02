import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {StartChatButton} from './StartChatButton.js'

const push = vi.fn()
vi.mock('next/link', () => ({
  default: ({children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props}>{children}</a>,
}))
vi.mock('next/navigation', () => ({useRouter: () => ({push})}))

const ipProfileId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const labels = {startChat: 'Chat', startingChat: 'Opening…', chatStartError: 'Unable to start a conversation.'}

afterEach(() => { vi.unstubAllGlobals(); push.mockReset() })

describe('StartChatButton', () => {
  it('sends guests to full-page sign-in with a safe localized profile return path', () => {
    render(<StartChatButton authenticated={false} ipProfileId={ipProfileId} labels={labels} locale="zh-CN"/>)

    expect(screen.getByRole('link', {name: 'Chat'})).toHaveAttribute('href', `/zh-CN/auth/sign-in?next=${encodeURIComponent(`/zh-CN/profiles/${ipProfileId}`)}`)
  })

  it('creates a conversation with only the public profile id and opens its localized route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({id: conversationId, ipProfile: {id: ipProfileId, username: 'luma', displayName: 'Luma'}, lastMessage: null, updatedAt: '2026-09-02T00:00:00.000Z', sendEnabled: true})))
    render(<StartChatButton authenticated ipProfileId={ipProfileId} labels={labels} locale="en"/>)

    fireEvent.click(screen.getByRole('button', {name: 'Chat'}))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ipProfileId})})))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/en/messages/${conversationId}`))
  })

  it('disables duplicate submissions while opening and reports an invalid response locally', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    render(<StartChatButton authenticated ipProfileId={ipProfileId} labels={labels} locale="en"/>)

    const button = screen.getByRole('button', {name: 'Chat'})
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.getByRole('button', {name: 'Opening…'})).toBeDisabled()
    expect(fetch).toHaveBeenCalledTimes(1)

    resolve(Response.json({id: conversationId, ipProfile: {id: ipProfileId, username: 'luma', displayName: 'Luma'}, lastMessage: null, updatedAt: '2026-09-02T00:00:00.000Z', sendEnabled: true, providerConversationId: 'private'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to start a conversation.')
    expect(push).not.toHaveBeenCalled()
  })

  it('aborts an in-flight request and ignores its response after unmount', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const {unmount} = render(<StartChatButton authenticated ipProfileId={ipProfileId} labels={labels} locale="en"/>)

    fireEvent.click(screen.getByRole('button', {name: 'Chat'}))
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    unmount()
    expect((init.signal as AbortSignal).aborted).toBe(true)

    resolve(Response.json({id: conversationId, ipProfile: {id: ipProfileId, username: 'luma', displayName: 'Luma'}, lastMessage: null, updatedAt: '2026-09-02T00:00:00.000Z', sendEnabled: true}))
    await Promise.resolve()
    await Promise.resolve()
    expect(push).not.toHaveBeenCalled()
  })

  it('aborts the previous profile operation and ignores its stale response after a profile change', async () => {
    let resolve!: (response: Response) => void
    const nextIpProfileId = '33333333-3333-4333-8333-333333333333'
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const {rerender} = render(<StartChatButton authenticated ipProfileId={ipProfileId} labels={labels} locale="en"/>)

    fireEvent.click(screen.getByRole('button', {name: 'Chat'}))
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    rerender(<StartChatButton authenticated ipProfileId={nextIpProfileId} labels={labels} locale="en"/>)
    expect((init.signal as AbortSignal).aborted).toBe(true)

    resolve(Response.json({invalid: true}))
    await Promise.resolve()
    await Promise.resolve()
    expect(push).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', {name: 'Chat'})).not.toBeDisabled()
  })
})
