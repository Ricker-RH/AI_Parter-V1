import {HumanShareRecipientPageSchema} from '@aifans/contracts'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {IpProfileShareAction} from './IpProfileShareAction.js'

const mocks = vi.hoisted(() => ({account: null as {id: string; kind: 'human'} | null}))
vi.mock('../account/CurrentAccountProvider.js', () => ({useOptionalCurrentAccount: () => mocks.account ? {account: mocks.account} : null}))

const profile = {id: '11111111-1111-4111-8111-111111111111', username: 'luna', displayName: 'Luna', bio: 'A calm IP', creator: undefined, kind: 'ip' as const, languages: ['en'] as ('en' | 'zh-CN')[], visualType: 'hybrid' as const}
const self = '22222222-2222-4222-8222-222222222222'
const mutual = '33333333-3333-4333-8333-333333333333'

function open(locale: 'en' | 'zh-CN' = 'en') {
  render(<IpProfileShareAction locale={locale} profile={profile}/>)
  fireEvent.click(screen.getByRole('button', {name: locale === 'en' ? 'More' : '更多'}))
  fireEvent.click(screen.getByRole('menuitem', {name: locale === 'en' ? 'Share' : '分享'}))
}

function recipientFetch() {
  const recipients = {items: [
    {id: mutual, displayName: 'Mutual', avatarUrl: 'https://cdn.example/mutual.webp'},
  ]}
  expect(HumanShareRecipientPageSchema.safeParse(recipients).success).toBe(true)
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/human-chat/share-recipients') return Promise.resolve(Response.json(recipients))
    if (url === `/api/human-chat/peers/${mutual}/messages`) return Promise.resolve(Response.json({message: {v: 1, id: '55555555-5555-4555-8555-555555555555', conversationId: '66666666-6666-4666-8666-666666666666', senderProfileId: self, clientRequestId: JSON.parse(String(init?.body)).clientRequestId, sequence: 1, createdAt: '2026-09-01T00:00:00.000Z', content: JSON.parse(String(init?.body)).content}}))
    return Promise.reject(new Error(`Unexpected ${url}`))
  })
}

afterEach(() => { mocks.account = null; vi.unstubAllGlobals() })

describe('IpProfileShareAction', () => {
  it('keeps sharing behind the IP-only overflow action and opens an in-app sheet', () => {
    open()
    expect(screen.getByRole('dialog', {name: 'Share Luna'})).toBeVisible()
    expect(screen.getByText('Share to')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Send to a friend'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Copy link'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'System share'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Create share image'})).toBeVisible()
    expect(screen.getByText('No mutual friends to share with yet.')).toBeVisible()
  })

  it('loads server-authorized mutual human recipients with avatar data and sends an optional note plus IP card to the peer route', async () => {
    mocks.account = {id: self, kind: 'human'}
    const fetch = recipientFetch()
    vi.stubGlobal('fetch', fetch)
    open()

    expect(await screen.findByRole('button', {name: /Mutual/})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Mutual'}).querySelector('img')).toHaveAttribute('src', 'https://cdn.example/mutual.webp')
    expect(fetch).toHaveBeenCalledWith('/api/human-chat/share-recipients', expect.objectContaining({method: 'GET'}))
    expect(fetch).not.toHaveBeenCalledWith('/api/human-relationships', expect.anything())

    fireEvent.click(screen.getByRole('button', {name: /Mutual/}))
    fireEvent.change(screen.getByRole('textbox', {name: 'Add a message'}), {target: {value: 'Hello there'}})
    fireEvent.click(screen.getByRole('button', {name: 'Send'}))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/human-chat/peers/${mutual}/messages`, expect.objectContaining({method: 'POST'})))
    const sends = fetch.mock.calls.filter(([url]) => url === `/api/human-chat/peers/${mutual}/messages`)
    expect(sends).toHaveLength(2)
    expect(sends.map(([, init]) => JSON.parse(String((init as RequestInit).body)).content)).toEqual([
      {kind: 'text', text: 'Hello there'},
      {kind: 'share', target: {kind: 'ip', id: profile.id}},
    ])
  })

  it('keeps the draft and gives a relationship-specific Chinese error when sharing can no longer be delivered', async () => {
    mocks.account = {id: self, kind: 'human'}
    const fetch = recipientFetch()
    fetch.mockImplementation((url: string) => {
      if (url === '/api/human-chat/share-recipients') return Promise.resolve(Response.json({items: [{id: mutual, displayName: 'Mutual', avatarUrl: null}]}))
      if (url === `/api/human-chat/peers/${mutual}/messages`) return Promise.resolve(Response.json({code: 'HUMAN_CHAT_MUTUAL_FOLLOW_REQUIRED'}, {status: 403}))
      return Promise.reject(new Error(`Unexpected ${url}`))
    })
    vi.stubGlobal('fetch', fetch)
    open('zh-CN')
    fireEvent.click(await screen.findByRole('button', {name: /Mutual/}))
    fireEvent.change(screen.getByRole('textbox', {name: '捎一句话'}), {target: {value: '保留这句话'}})
    fireEvent.click(screen.getByRole('button', {name: '发送'}))

    expect(await screen.findByRole('alert')).toHaveTextContent('当前无法发送给该好友，请确认仍互相关注后重试。')
    expect(screen.getByRole('textbox', {name: '捎一句话'})).toHaveValue('保留这句话')
  })
})
