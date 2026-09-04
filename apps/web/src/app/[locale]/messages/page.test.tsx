import {describe, expect, it, vi} from 'vitest'
import {encodeChatConversationCursor, encodeChatMessageCursor} from '@aifans/contracts'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'

vi.mock('next/navigation', () => ({notFound: vi.fn()}))
import MessagesPage from './page.js'
import {readUserReturnTo} from '../../../lib/auth/return-to'

const conversationId='11111111-1111-4111-8111-111111111111'

describe('cached messages route shell', () => {
  it('keeps a validated human deep link while leaving account and private reads to the client cache boundary', async()=>{
    const id='33333333-3333-4333-8333-333333333333'
    const element=await MessagesPage({params:Promise.resolve({locale:'en'}),searchParams:Promise.resolve({humanConversation:id})})
    expect(element.props.selectedHumanId).toBe(id)
    expect(element.props.locale).toBe('en')
    expect(readUserReturnTo('en',`/en/messages?humanConversation=${id}`)).toBe(`/en/messages?humanConversation=${id}`)
    expect(readUserReturnTo('en',`/en/messages?humanConversation=${id}&humanConversation=${id}`)).toBeUndefined()
  })

  it('passes only a canonical AI inbox cursor to the client cache key', async()=>{
    const cursor=encodeChatConversationCursor({v:1,kind:'chat-conversations',updatedAt:'2026-09-01T00:00:00.000Z',id:conversationId})
    const valid=await MessagesPage({params:Promise.resolve({locale:'en'}),searchParams:Promise.resolve({cursor})})
    const invalid=await MessagesPage({params:Promise.resolve({locale:'en'}),searchParams:Promise.resolve({cursor:encodeChatMessageCursor({v:1,kind:'chat-messages',createdAt:'2026-09-01T00:00:00.000Z',id:conversationId})})})
    expect(valid.props.initialCursor).toBe(cursor)
    expect(invalid.props.initialCursor).toBeUndefined()
  })

  it('keeps the persistent-messages copy exactly aligned in both locales', () => {
    expect(Object.keys(en.chat).sort()).toEqual(Object.keys(zh.chat).sort())
    expect(en.chat).toMatchObject({title: 'Messages', chatTab: 'Chats', notificationsTab: 'Notifications', searchLabel: 'Search conversations', noConversations: 'Your inbox is empty', emptyAction: 'Explore home', selectConversation: 'Select a conversation', back: 'Back', loadMore: 'Load more', loadEarlierMessages: 'Load earlier messages', messagePlaceholder: 'Write a message…', send: 'Send', sending: 'Sending…', messageFailed: 'Message failed', retry: 'Retry', providerUnavailable: 'The chat provider is unavailable.', unavailable: 'Messages are unavailable right now.', invalidResponse: 'The chat service returned an invalid response.', emptyHistory: 'No messages yet'})
    expect(JSON.stringify(en.chat)).not.toMatch(/UUID|session|demo/i)
  })
})
