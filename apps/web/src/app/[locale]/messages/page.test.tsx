import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {encodeChatConversationCursor, encodeChatMessageCursor} from '@aifans/contracts'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'

const {access, conversations} = vi.hoisted(() => ({access: vi.fn(), conversations: vi.fn()}))
vi.mock('../../../lib/current-account',()=>({fetchCurrentAccountResult:async()=>({status:'authenticated',account:{id:'22222222-2222-4222-8222-222222222222'}})}))
vi.mock('../../../lib/auth/access-policy.js', () => ({requireAuthenticatedPage: access, redirectToUserSignIn: vi.fn()}))
vi.mock('../../../lib/chat-api.js', () => ({fetchConversations: conversations}))
vi.mock('next/navigation', () => ({notFound: vi.fn(), useRouter: () => ({refresh: vi.fn()})}))
import MessagesPage from './page.js'
import {readUserReturnTo} from '../../../lib/auth/return-to'

const conversation = {id: '11111111-1111-4111-8111-111111111111', ipProfile: {id: '22222222-2222-4222-8222-222222222222', displayName: 'Luma', username: 'luma'}, lastMessage: {body: 'Hello', role: 'assistant' as const, createdAt: '2026-09-01T00:00:00.000Z'}, updatedAt: '2026-09-01T00:00:00.000Z', sendEnabled: true}

describe('persistent messages list page', () => {
  it('preserves a strictly validated human conversation deep link across authentication', async()=>{
    const id='33333333-3333-4333-8333-333333333333'
    const element=await MessagesPage({params:Promise.resolve({locale:'en'}),searchParams:Promise.resolve({humanConversation:id})})
    expect(element.props.selectedHumanId).toBe(id)
    expect(element.props.snapshotViewerId).toBe('22222222-2222-4222-8222-222222222222')
    expect(access).toHaveBeenCalledWith({locale:'en',returnTo:`/en/messages?humanConversation=${id}`})
    expect(readUserReturnTo('en',`/en/messages?humanConversation=${id}`)).toBe(`/en/messages?humanConversation=${id}`)
    expect(readUserReturnTo('en',`/en/messages?humanConversation=${id}&humanConversation=${id}`)).toBeUndefined()
  })
  beforeEach(() => {
    access.mockReset().mockResolvedValue({status: 'authenticated', token: 'token'})
    conversations.mockReset().mockResolvedValue({status: 'ok', data: {items: [conversation], nextCursor: null}})
  })

  it('loads owner-scoped conversations only after the page access guard', async () => {
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages'})
    expect(conversations).toHaveBeenCalledWith({token: 'token'})
    expect(screen.getByRole('heading', {name: 'Messages'})).toBeVisible()
    expect(screen.getByRole('link', {name: 'Chats'})).toHaveAttribute('href', '/en/messages')
    expect(screen.getByRole('link', {name: 'Notifications'})).toHaveAttribute('href', '/en/messages/notifications')
    expect(screen.getByRole('searchbox', {name: 'Search conversations'})).toBeVisible()
    expect(screen.getByRole('link', {name: /Luma/})).toHaveAttribute('href', '/en/messages/11111111-1111-4111-8111-111111111111')
    expect(screen.getByText('Select a conversation')).toBeVisible()
  })

  it('does not mount data UI when page access is unavailable', async () => {
    access.mockResolvedValue({status: 'unavailable'})
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))

    expect(conversations).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(en.chat.unavailable)
    expect(screen.getByRole('button', {name: en.chat.unavailableAction})).toBeEnabled()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByText(en.chat.selectConversation)).toBeNull()
    expect(screen.queryByText(en.chat.noConversations)).toBeNull()
  })

  it('ignores repeated query values instead of passing an array to chat reads', async () => {
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor: ['first', 'second']})}))
    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages'})
    expect(conversations).toHaveBeenCalledWith({token: 'token'})
  })

  it('uses only a canonical conversation cursor for the list read and auth return path', async () => {
    const cursor = encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: '2026-09-01T00:00:00.000Z', id: conversation.id})
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({cursor})}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: `/en/messages?cursor=${encodeURIComponent(cursor)}`})
    expect(conversations).toHaveBeenCalledWith({cursor, token: 'token'})
    expect(screen.getByRole('link', {name: /Luma/})).toHaveAttribute('href', `/en/messages/${conversation.id}?listCursor=${encodeURIComponent(cursor)}`)
  })

  it.each([
    {name: 'malformed', query: {cursor: 'not-a-cursor'}},
    {name: 'message-kind', query: {cursor: encodeChatMessageCursor({v: 1, kind: 'chat-messages', createdAt: '2026-09-01T00:00:00.000Z', id: conversation.id})}},
    {name: 'duplicate', query: {cursor: ['first', 'second']}},
    {name: 'unknown-key', query: {cursor: encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: '2026-09-01T00:00:00.000Z', id: conversation.id}), unknown: 'value'}},
  ])('drops an invalid $name query before access and list reads', async ({query}) => {
    render(await MessagesPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve(query)}))

    expect(access).toHaveBeenCalledWith({locale: 'en', returnTo: '/en/messages'})
    expect(conversations).toHaveBeenCalledWith({token: 'token'})
  })

  it('keeps the persistent-messages copy exactly aligned in both locales', () => {
    expect(Object.keys(en.chat).sort()).toEqual(Object.keys(zh.chat).sort())
    expect(en.chat).toMatchObject({title: 'Messages', chatTab: 'Chats', notificationsTab: 'Notifications', searchLabel: 'Search conversations', noConversations: 'Your inbox is empty', emptyAction: 'Explore home', selectConversation: 'Select a conversation', back: 'Back', loadMore: 'Load more', loadEarlierMessages: 'Load earlier messages', messagePlaceholder: 'Write a message…', send: 'Send', sending: 'Sending…', messageFailed: 'Message failed', retry: 'Retry', providerUnavailable: 'The chat provider is unavailable.', unavailable: 'Messages are unavailable right now.', invalidResponse: 'The chat service returned an invalid response.', emptyHistory: 'No messages yet'})
    expect(JSON.stringify(en.chat)).not.toMatch(/UUID|session|demo/i)
  })
})
