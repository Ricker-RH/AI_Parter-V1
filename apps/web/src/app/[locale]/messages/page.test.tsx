import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'

const {access, conversations} = vi.hoisted(() => ({access: vi.fn(), conversations: vi.fn()}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: vi.fn()}))
vi.mock('../../../lib/chat-api.js', () => ({fetchConversations: conversations}))
vi.mock('next/navigation', () => ({notFound: vi.fn()}))
import MessagesPage from './page.js'

const conversation = {id: '11111111-1111-4111-8111-111111111111', ipProfile: {id: '22222222-2222-4222-8222-222222222222', displayName: 'Luma', username: 'luma'}, lastMessage: {body: 'Hello', role: 'assistant' as const, createdAt: '2026-09-01T00:00:00.000Z'}, updatedAt: '2026-09-01T00:00:00.000Z', sendEnabled: true}

describe('persistent messages list page', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    conversations.mockReset().mockResolvedValue({status: 'ok', data: {items: [conversation], nextCursor: null}})
  })

  it('loads owner-scoped conversations only after the page access guard', async () => {
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages'})
    expect(conversations).toHaveBeenCalledWith({token: 'token'})
    expect(screen.getByRole('heading', {name: 'Messages'})).toBeVisible()
    expect(screen.getByRole('link', {name: /Luma/})).toHaveAttribute('href', '/en/messages/11111111-1111-4111-8111-111111111111')
    expect(screen.getByText('Select a conversation')).toBeVisible()
  })

  it('does not mount data UI when page access is unavailable', async () => {
    access.mockResolvedValue({status: 'unavailable'})
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(conversations).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(en.chat.unavailable)
  })

  it('ignores repeated query values instead of passing an array to chat reads', async () => {
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor: ['first', 'second']})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages'})
    expect(conversations).toHaveBeenCalledWith({token: 'token'})
  })

  it('keeps the persistent-messages copy exactly aligned in both locales', () => {
    expect(Object.keys(en.chat).sort()).toEqual(Object.keys(zh.chat).sort())
    expect(en.chat).toMatchObject({title: 'Messages', noConversations: 'No conversations yet', selectConversation: 'Select a conversation', back: 'Back', loadMore: 'Load more', loadEarlierMessages: 'Load earlier messages', messagePlaceholder: 'Write a message…', send: 'Send', sending: 'Sending…', messageFailed: 'Message failed', retry: 'Retry', providerUnavailable: 'The chat provider is unavailable.', unavailable: 'Messages are unavailable right now.', invalidResponse: 'The chat service returned an invalid response.', emptyHistory: 'No messages yet'})
    expect(JSON.stringify(en.chat)).not.toMatch(/UUID|session|demo/i)
  })
})
