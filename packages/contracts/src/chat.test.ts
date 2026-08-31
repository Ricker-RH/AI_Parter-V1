import {describe, expect, it} from 'vitest'
import {ChatMessageInputSchema, ChatMessageResponseSchema} from './chat.js'

describe('chat contracts', () => {
  it('trims a valid message and accepts only the public chat fields', () => {
    const conversationId = '245652a3-c5d8-4b60-b94d-c1556db030ff'

    expect(ChatMessageInputSchema.parse({message: '  hello  ', conversationId, locale: 'zh-CN'})).toEqual({
      message: 'hello',
      conversationId,
      locale: 'zh-CN',
    })
    expect(ChatMessageInputSchema.safeParse({message: 'hello', user: 'forged'}).success).toBe(false)
    expect(ChatMessageInputSchema.safeParse({message: 'hello', ipProfileId: conversationId}).success).toBe(false)
  })

  it('rejects blank, oversized, invalid conversation, and unsupported locale inputs', () => {
    expect(ChatMessageInputSchema.safeParse({message: '   '}).success).toBe(false)
    expect(ChatMessageInputSchema.safeParse({message: 'x'.repeat(4001)}).success).toBe(false)
    expect(ChatMessageInputSchema.safeParse({message: 'hello', conversationId: 'not-a-uuid'}).success).toBe(false)
    expect(ChatMessageInputSchema.safeParse({message: 'hello', locale: 'fr'}).success).toBe(false)
  })

  it('accepts only a strict provider-neutral response', () => {
    const value = {
      answer: 'Hello',
      conversationId: '245652a3-c5d8-4b60-b94d-c1556db030ff',
      messageId: '2b483560-1331-454d-8c7a-42d40a29fd1f',
      createdAt: '2026-09-01T12:00:00.000Z',
    }

    expect(ChatMessageResponseSchema.parse(value)).toEqual(value)
    expect(ChatMessageResponseSchema.safeParse({...value, provider: 'dify'}).success).toBe(false)
    expect(ChatMessageResponseSchema.safeParse({...value, conversationId: 'bad'}).success).toBe(false)
  })
})
