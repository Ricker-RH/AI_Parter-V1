import {describe, expect, it} from 'vitest'
import {ChatBodySchema, ChatConversationCreateInputSchema, ChatConversationCursorSchema, ChatConversationPageSchema, ChatConversationSummarySchema, ChatHistoryPageSchema, ChatMessageSchema, ChatSendInputSchema, ChatSendResponseSchema, ChatStreamEventSchema, MAX_CHAT_CURSOR_LENGTH, decodeChatConversationCursor, decodeChatMessageCursor, encodeChatConversationCursor, encodeChatMessageCursor} from './chat.js'

const conversationId = '245652a3-c5d8-4b60-b94d-c1556db030ff'
const ipProfileId = '2b483560-1331-454d-8c7a-42d40a29fd1f'
const messageId = '9a35c329-0a22-4af6-bf0c-3eac9c4f3613'
const requestId = 'f368ed83-8e3d-4274-a073-5dae22302055'
const timestamp = '2026-09-01T12:00:00.000Z'

describe('chat contracts', () => {
  it('accepts only strict provider-neutral chat projections', () => {
    const identity = {id: ipProfileId, username: 'luna_ip', displayName: 'Luna'}
    const message = {id: messageId, role: 'human' as const, body: 'Hello', deliveryState: 'sent' as const, createdAt: timestamp}
    const summary = {id: conversationId, ipProfile: identity, lastMessage: {body: 'Hello', role: 'human' as const, createdAt: timestamp}, updatedAt: timestamp, sendEnabled: true, unreadCount: 0}

    expect(ChatMessageSchema.parse(message)).toEqual(message)
    expect(ChatConversationSummarySchema.parse(summary)).toEqual(summary)
    expect(ChatConversationSummarySchema.parse({...summary, unreadCount: 2})).toEqual({...summary, unreadCount: 2})
    expect(ChatConversationPageSchema.parse({items: [summary], nextCursor: null})).toEqual({items: [summary], nextCursor: null})
    expect(ChatHistoryPageSchema.parse({conversation: summary, items: [message], nextCursor: null})).toEqual({conversation: summary, items: [message], nextCursor: null})
    expect(ChatHistoryPageSchema.safeParse({items: [message], nextCursor: null}).success).toBe(false)
    expect(ChatHistoryPageSchema.safeParse({conversation: summary, items: [message], nextCursor: null, provider: 'dify'}).success).toBe(false)
    expect(ChatMessageSchema.safeParse({...message, providerMessageId: 'provider-1'}).success).toBe(false)
    expect(ChatConversationSummarySchema.safeParse({...summary, providerConversationId: 'provider-1'}).success).toBe(false)
    expect(ChatConversationSummarySchema.safeParse({...summary, ipProfile: {...identity, secret: true}}).success).toBe(false)
    expect(ChatBodySchema.parse('x'.repeat(4000))).toHaveLength(4000)
    expect(ChatMessageSchema.safeParse({...message, body: ''}).success).toBe(false)
    expect(ChatMessageSchema.safeParse({...message, body: 'x'.repeat(4001)}).success).toBe(false)
    expect(ChatConversationSummarySchema.safeParse({...summary, lastMessage: {...summary.lastMessage!, body: 'x'.repeat(4001)}}).success).toBe(false)
    expect(ChatConversationPageSchema.safeParse({items: Array.from({length: 101}, () => summary), nextCursor: null}).success).toBe(false)
    expect(ChatHistoryPageSchema.safeParse({conversation: summary, items: Array.from({length: 101}, () => message), nextCursor: null}).success).toBe(false)
    expect(ChatConversationPageSchema.safeParse({items: [], nextCursor: 'a'.repeat(1025)}).success).toBe(false)
  })

  it('trims send text and accepts only new conversation and send inputs', () => {
    expect(ChatConversationCreateInputSchema.parse({ipProfileId})).toEqual({ipProfileId})
    expect(ChatSendInputSchema.parse({message: '  hello  ', requestId, locale: 'zh-CN'})).toEqual({message: 'hello', requestId, locale: 'zh-CN'})
    expect(ChatSendInputSchema.safeParse({message: 'hello', requestId, conversationId}).success).toBe(false)
    expect(ChatSendInputSchema.safeParse({message: 'hello', requestId, providerConversationId: 'provider-1'}).success).toBe(false)
    expect(ChatConversationCreateInputSchema.safeParse({ipProfileId, providerId: 'provider-1'}).success).toBe(false)
    expect(ChatSendInputSchema.safeParse({message: '   ', requestId}).success).toBe(false)
    expect(ChatSendInputSchema.safeParse({message: 'x'.repeat(4001), requestId}).success).toBe(false)
    expect(ChatSendInputSchema.safeParse({message: 'hello', requestId: 'not-a-uuid'}).success).toBe(false)
  })

  it('models sends and stream events without provider identifiers', () => {
    const humanMessage = {id: messageId, role: 'human' as const, body: 'Hello', deliveryState: 'sent' as const, createdAt: timestamp}
    const assistantMessage = {...humanMessage, id: requestId, role: 'assistant' as const, body: 'Hi'}
    expect(ChatSendResponseSchema.parse({humanMessage, assistantMessage})).toEqual({humanMessage, assistantMessage})
    expect(ChatStreamEventSchema.parse({type: 'human_message', message: humanMessage})).toEqual({type: 'human_message', message: humanMessage})
    expect(ChatStreamEventSchema.parse({type: 'assistant_delta', delta: 'Hi'})).toEqual({type: 'assistant_delta', delta: 'Hi'})
    expect(ChatStreamEventSchema.parse({type: 'assistant_complete', message: assistantMessage})).toEqual({type: 'assistant_complete', message: assistantMessage})
    expect(ChatStreamEventSchema.parse({type: 'failed', code: 'CHAT_INTERRUPTED'})).toEqual({type: 'failed', code: 'CHAT_INTERRUPTED'})
    expect(ChatStreamEventSchema.safeParse({type: 'assistant_delta', delta: ''}).success).toBe(false)
    expect(ChatStreamEventSchema.parse({type: 'assistant_delta', delta: 'x'.repeat(4000)})).toEqual({type: 'assistant_delta', delta: 'x'.repeat(4000)})
    expect(ChatStreamEventSchema.safeParse({type: 'assistant_delta', delta: 'x'.repeat(4001)}).success).toBe(false)
    expect(ChatStreamEventSchema.safeParse({type: 'failed', code: 'OTHER'}).success).toBe(false)
    expect(ChatSendResponseSchema.safeParse({humanMessage, assistantMessage, provider: 'dify'}).success).toBe(false)
  })

  it('round trips strict conversation and message cursors', () => {
    const conversationCursor = {v: 1 as const, kind: 'chat-conversations' as const, updatedAt: timestamp, id: conversationId}
    const messageCursor = {v: 1 as const, kind: 'chat-messages' as const, createdAt: timestamp, id: messageId}
    expect(ChatConversationCursorSchema.parse(conversationCursor)).toEqual(conversationCursor)
    expect(decodeChatConversationCursor(encodeChatConversationCursor(conversationCursor))).toEqual(conversationCursor)
    expect(decodeChatMessageCursor(encodeChatMessageCursor(messageCursor))).toEqual(messageCursor)
  })

  it('rejects malformed, noncanonical, cross-kind, and non-strict chat cursors', () => {
    const cursor = {v: 1 as const, kind: 'chat-conversations' as const, updatedAt: timestamp, id: conversationId}
    const encodedExtra = Buffer.from(JSON.stringify({...cursor, providerId: 'provider-1'}), 'utf8').toString('base64url')
    const encodedBadDate = Buffer.from(JSON.stringify({...cursor, updatedAt: 'yesterday'}), 'utf8').toString('base64url')
    const encodedBadId = Buffer.from(JSON.stringify({...cursor, id: 'not-a-uuid'}), 'utf8').toString('base64url')
    const duplicateId = Buffer.from(`{"v":1,"kind":"chat-conversations","updatedAt":"${timestamp}","id":"${conversationId}","id":"${messageId}"}`, 'utf8').toString('base64url')
    const noncanonical = encodeChatConversationCursor(cursor) + '=='
    expect(() => decodeChatConversationCursor('not-a-cursor')).toThrow('INVALID_CURSOR')
    expect(() => decodeChatConversationCursor(encodedExtra)).toThrow('INVALID_CURSOR')
    expect(() => decodeChatConversationCursor(encodedBadDate)).toThrow('INVALID_CURSOR')
    expect(() => decodeChatConversationCursor(encodedBadId)).toThrow('INVALID_CURSOR')
    expect(() => decodeChatConversationCursor(duplicateId)).toThrow('INVALID_CURSOR')
    expect(() => decodeChatConversationCursor(encodeChatMessageCursor({v: 1, kind: 'chat-messages', createdAt: timestamp, id: messageId}))).toThrow('INVALID_CURSOR')
    expect(() => decodeChatConversationCursor(noncanonical)).toThrow('INVALID_CURSOR')
    expect(MAX_CHAT_CURSOR_LENGTH).toBe(1024)
    expect(() => decodeChatConversationCursor('a'.repeat(MAX_CHAT_CURSOR_LENGTH + 1))).toThrow('INVALID_CURSOR')
  })
})
