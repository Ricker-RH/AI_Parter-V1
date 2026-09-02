import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {encodeChatConversationCursor, encodeChatMessageCursor} from '@aifans/contracts'

const {access, conversations, history, redirectToUserSignIn, notFound} = vi.hoisted(() => ({access: vi.fn(), conversations: vi.fn(), history: vi.fn(), redirectToUserSignIn: vi.fn(), notFound: vi.fn()}))
vi.mock('../../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn}))
vi.mock('../../../../lib/chat-api.js', () => ({fetchConversations: conversations, fetchConversationHistory: history}))
vi.mock('next/navigation', () => ({notFound, useRouter: () => ({refresh: vi.fn()})}))
import ConversationPage from './page.js'

const id = '11111111-1111-4111-8111-111111111111'
const conversation = {id, ipProfile: {id: '22222222-2222-4222-8222-222222222222', displayName: 'Luma', username: 'luma'}, lastMessage: null, updatedAt: '2026-09-01T00:00:00.000Z', sendEnabled: true}

describe('persistent conversation detail page', () => {
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    conversations.mockReset().mockResolvedValue({status: 'ok', data: {items: [conversation], nextCursor: null}})
    history.mockReset().mockResolvedValue({status: 'ok', data: {conversation, items: [{id: '33333333-3333-4333-8333-333333333333', role: 'assistant', body: 'Welcome back', deliveryState: 'sent', createdAt: '2026-09-01T00:00:00.000Z'}], nextCursor: null}})
  })

  it('reads both the owner-scoped list and selected history after access succeeds', async () => {
    render(await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: id}), searchParams: Promise.resolve({})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: `/en/messages/${id}`})
    expect(conversations).toHaveBeenCalledWith({token: 'token'})
    expect(history).toHaveBeenCalledWith(id, {token: 'token'})
    expect(screen.getByText('Welcome back')).toBeVisible()
    expect(screen.getByRole('link', {name: 'Back'})).toHaveAttribute('href', '/en/messages')
  })

  it('uses a canonical list cursor for the adjacent list, auth return, and Back destination', async () => {
    const listCursor = encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: '2026-09-01T00:00:00.000Z', id})
    render(await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: id}), searchParams: Promise.resolve({listCursor})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: `/en/messages/${id}?listCursor=${encodeURIComponent(listCursor)}`})
    expect(conversations).toHaveBeenCalledWith({cursor: listCursor, token: 'token'})
    expect(screen.getByRole('link', {name: 'Back'})).toHaveAttribute('href', `/en/messages?cursor=${encodeURIComponent(listCursor)}`)
  })

  it('keeps conversation-list and message-history cursor kinds separate', async () => {
    const listCursor = encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: '2026-09-01T00:00:00.000Z', id})
    const historyCursor = encodeChatMessageCursor({v: 1, kind: 'chat-messages', createdAt: '2026-08-31T00:00:00.000Z', id})
    render(await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: id}), searchParams: Promise.resolve({listCursor, cursor: historyCursor})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: `/en/messages/${id}?listCursor=${encodeURIComponent(listCursor)}&cursor=${encodeURIComponent(historyCursor)}`})
    expect(conversations).toHaveBeenCalledWith({cursor: listCursor, token: 'token'})
    expect(history).toHaveBeenCalledWith(id, {cursor: historyCursor, token: 'token'})
  })

  it('sends bad ids and unavailable conversations to the not-found boundary', async () => {
    await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: 'not-an-id'}), searchParams: Promise.resolve({})})
    expect(notFound).toHaveBeenCalled()
    expect(access).not.toHaveBeenCalled()

    access.mockClear()
    history.mockResolvedValue({status: 'not-found'})
    await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: id}), searchParams: Promise.resolve({})})
    expect(notFound).toHaveBeenCalledTimes(2)
  })

  it('redirects an expired chat read to full-page sign-in', async () => {
    history.mockResolvedValue({status: 'auth-required'})
    await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: id}), searchParams: Promise.resolve({})})
    expect(redirectToUserSignIn).toHaveBeenCalledWith({locale: 'en', returnTo: `/en/messages/${id}`})
  })

  it('keeps a successful detail visible when the conversation list fails and lets the client load older history', async () => {
    conversations.mockResolvedValue({status: 'unavailable'})
    history.mockResolvedValue({status: 'ok', data: {conversation, items: [], nextCursor: 'older'}})
    render(await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: id}), searchParams: Promise.resolve({cursor: ['first', 'second']})}))
    expect(history).toHaveBeenCalledWith(id, {token: 'token'})
    expect(screen.getByText('No messages yet')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Load earlier messages'})).toBeVisible()
  })

  it('ignores a noncanonical history cursor instead of poisoning the history read', async () => {
    history.mockResolvedValue({status: 'ok', data: {conversation, items: [], nextCursor: null}})
    render(await ConversationPage({params: Promise.resolve({locale: 'en', conversationId: id}), searchParams: Promise.resolve({cursor: 'older'})}))
    expect(history).toHaveBeenCalledWith(id, {token: 'token'})
  })
})
