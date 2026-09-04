import {HumanInboxPageSchema} from '@aifans/contracts'
import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {IpProfileShareAction} from './IpProfileShareAction.js'

const mocks = vi.hoisted(() => ({account: null as {id: string; kind: 'human'} | null}))
vi.mock('../account/CurrentAccountProvider.js', () => ({useOptionalCurrentAccount: () => mocks.account ? {account: mocks.account} : null}))

const profile = {id: '11111111-1111-4111-8111-111111111111', username: 'luna', displayName: 'Luna', bio: 'A calm IP', creator: undefined, kind: 'ip' as const, languages: ['en'] as ('en' | 'zh-CN')[], visualType: 'hybrid' as const}

describe('IpProfileShareAction', () => {
  it('keeps sharing behind the IP-only overflow action and opens an in-app sheet', () => {
    render(<IpProfileShareAction locale="en" profile={profile}/>)
    fireEvent.click(screen.getByRole('button', {name: 'More'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Share'}))
    expect(screen.getByRole('dialog', {name: 'Share Luna'})).toBeVisible()
    expect(screen.getByText('Share to')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Copy link'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'System share'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Create share image'})).toBeVisible()
    expect(screen.getByText('No mutual friends to share with yet.')).toBeVisible()
  })

  it('only offers current mutual human contacts as recipients', async () => {
    const self = '22222222-2222-4222-8222-222222222222'
    const mutual = '33333333-3333-4333-8333-333333333333'
    const oneWay = '44444444-4444-4444-8444-444444444444'
    mocks.account = {id: self, kind: 'human'}
    const inbox = {items: [
        {conversation: {v: 1, id: '55555555-5555-4555-8555-555555555555', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', participants: [{kind: 'HUMAN', id: self, username: 'self', displayName: 'Me', avatarUrl: null}, {kind: 'HUMAN', id: mutual, username: 'mutual', displayName: 'Mutual', avatarUrl: null}]}, latestMessage: null, unreadCount: 0, lastReadSequence: 0},
        {conversation: {v: 1, id: '66666666-6666-4666-8666-666666666666', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', participants: [{kind: 'HUMAN', id: self, username: 'self', displayName: 'Me', avatarUrl: null}, {kind: 'HUMAN', id: oneWay, username: 'oneway', displayName: 'One way', avatarUrl: null}]}, latestMessage: null, unreadCount: 0, lastReadSequence: 0},
      ], nextCursor: null}
    expect(HumanInboxPageSchema.safeParse(inbox).success).toBe(true)
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/human-chat/conversations')) return Promise.resolve(Response.json(inbox))
      return Promise.resolve(Response.json({items: [
        {profileId: mutual, isOwner: false, following: true, followedBy: true, blocked: false},
        {profileId: oneWay, isOwner: false, following: true, followedBy: false, blocked: false},
      ]}))
    }))

    render(<IpProfileShareAction locale="en" profile={profile}/>)
    fireEvent.click(screen.getByRole('button', {name: 'More'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Share'}))

    expect(await screen.findByRole('button', {name: /Mutual/})).toBeVisible()
    expect(screen.queryByRole('button', {name: /One way/})).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/human-relationships', expect.objectContaining({method: 'POST'}))
  })
})
