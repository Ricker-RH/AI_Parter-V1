import {act, cleanup, render, screen, waitFor} from '@testing-library/react'
import {StrictMode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {Account} from '@aifans/contracts'
import {CurrentAccountProvider, publishAccountUpdate, useCurrentAccount} from './CurrentAccountProvider.js'

const account: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  username: 'rui',
  displayName: 'Rui',
  avatarUrl: 'https://media.example/rui.webp',
  preferredLocale: 'en',
  creatorModeEnabled: false,
  profileVersion: 1,
  background: {type: 'color', colorKey: 'paper'},
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  readonly name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()

  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }

  emit(data: unknown) {
    this.onmessage?.({data} as MessageEvent)
  }
}

function Consumer({label}: {label: string}) {
  const {account: current, loading} = useCurrentAccount()
  return <output aria-label={label}>{loading ? 'loading' : current?.displayName ?? 'anonymous'}</output>
}

beforeEach(() => {
  FakeBroadcastChannel.instances = []
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CurrentAccountProvider', () => {
  it('lazily fetches and strictly parses the current account once in StrictMode', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(account))
    vi.stubGlobal('fetch', request)

    render(<StrictMode><CurrentAccountProvider><Consumer label="identity"/></CurrentAccountProvider></StrictMode>)

    expect(screen.getByLabelText('identity')).toHaveTextContent('loading')
    await waitFor(() => expect(screen.getByLabelText('identity')).toHaveTextContent('Rui'))
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith('/api/me', {cache: 'no-store', credentials: 'include', signal: expect.any(AbortSignal)})
    expect(FakeBroadcastChannel.instances).toHaveLength(1)
    expect(FakeBroadcastChannel.instances[0]?.name).toBe('aifans-account')
  })

  it('publishes saved accounts synchronously in this window without sending the account cross-tab', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<CurrentAccountProvider initialAccount={account}><Consumer label="first"/><Consumer label="second"/></CurrentAccountProvider>)
    const updated = {...account, displayName: 'Rui Updated', profileVersion: 2}

    act(() => publishAccountUpdate(updated))

    expect(screen.getByLabelText('first')).toHaveTextContent('Rui Updated')
    expect(screen.getByLabelText('second')).toHaveTextContent('Rui Updated')
    expect(FakeBroadcastChannel.instances[0]?.postMessage).toHaveBeenCalledWith({type: 'updated'})
    expect(JSON.stringify(FakeBroadcastChannel.instances[0]?.postMessage.mock.calls)).not.toContain('Rui Updated')
  })

  it('re-fetches after another tab broadcasts an update', async () => {
    const updated = {...account, displayName: 'New tab name', profileVersion: 2}
    const request = vi.fn().mockResolvedValue(Response.json(updated))
    vi.stubGlobal('fetch', request)
    render(<CurrentAccountProvider initialAccount={account}><Consumer label="identity"/></CurrentAccountProvider>)

    act(() => FakeBroadcastChannel.instances[0]?.emit({type: 'updated'}))

    await waitFor(() => expect(screen.getByLabelText('identity')).toHaveTextContent('New tab name'))
    expect(request).toHaveBeenCalledOnce()
  })

  it('keeps same-window updates working when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    render(<CurrentAccountProvider initialAccount={account}><Consumer label="identity"/></CurrentAccountProvider>)

    expect(() => act(() => publishAccountUpdate({...account, displayName: 'Local only'}))).not.toThrow()

    expect(screen.getByLabelText('identity')).toHaveTextContent('Local only')
  })

  it('ignores a stale initial request after a synchronous saved-account update', async () => {
    let resolveRequest!: (response: Response) => void
    const request = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve }))
    vi.stubGlobal('fetch', request)
    render(<StrictMode><CurrentAccountProvider><Consumer label="identity"/></CurrentAccountProvider></StrictMode>)
    await waitFor(() => expect(request).toHaveBeenCalledOnce())

    act(() => publishAccountUpdate({...account, displayName: 'Saved name', profileVersion: 2}))
    await act(async () => resolveRequest(Response.json(account)))

    expect(screen.getByLabelText('identity')).toHaveTextContent('Saved name')
    expect(request).toHaveBeenCalledOnce()
  })

  it('cleans up the shared channel and aborts work after the real unmount', async () => {
    let signal: AbortSignal | undefined
    const request = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return new Promise<Response>(() => undefined)
    })
    vi.stubGlobal('fetch', request)
    const view = render(<CurrentAccountProvider><Consumer label="identity"/></CurrentAccountProvider>)
    await waitFor(() => expect(request).toHaveBeenCalledOnce())
    const channel = FakeBroadcastChannel.instances[0]!

    view.unmount()
    await act(async () => Promise.resolve())

    expect(channel.close).toHaveBeenCalledOnce()
    expect(signal?.aborted).toBe(true)
  })
})
