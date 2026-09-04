import {describe, expect, it} from 'vitest'
import * as contracts from './index.js'

const id = '123e4567-e89b-42d3-a456-426614174000'
const peerId = '123e4567-e89b-42d3-a456-426614174001'
const now = '2026-09-04T00:00:00Z'
const identity = {kind: 'HUMAN', id, displayName: 'Alice', username: 'alice', avatarUrl: null}
const message = {v: 1, id, conversationId: id, senderProfileId: peerId, clientRequestId: id, sequence: 1, createdAt: now, content: {kind: 'text', text: 'hello'}}

describe('human chat v1 contracts', () => {
  it('exports and accepts a strict versioned message', () => {
    expect(contracts).toHaveProperty('HumanMessageSchema')
    expect(contracts.HumanMessageSchema.parse(message)).toEqual(message)
  })
  it('requires exactly two distinct human participants', () => {
    const conversation = {v: 1, id, participants: [identity, {...identity, id: peerId}], createdAt: now, updatedAt: now}
    expect(contracts.HumanConversationSchema.safeParse(conversation).success).toBe(true)
    for (const participants of [[identity], [identity, identity], [identity, {...identity, id: id.toUpperCase()}], [identity, {...identity, id: peerId}, identity]]) {
      expect(contracts.HumanConversationSchema.safeParse({...conversation, participants}).success).toBe(false)
    }
  })
  it('rejects sender spoofing and arbitrary media urls in client sends', () => {
    const input = {clientRequestId: id, content: message.content}
    expect(contracts.HumanSendInputSchema.safeParse(input).success).toBe(true)
    for (const extra of [{senderProfileId: peerId}, {sender: identity}, {conversationId: id}]) {
      expect(contracts.HumanSendInputSchema.safeParse({...input, ...extra}).success).toBe(false)
    }
    expect(contracts.HumanSendInputSchema.safeParse({...input, content: {kind: 'image', attachmentId: id, url: 'https://evil.test/a'}}).success).toBe(false)
  })
  it('bounds every content variant and validates internal share ids', () => {
    for (const content of [{kind: 'text', text: 'a'.repeat(4000)}, {kind: 'image', attachmentId: id}, {kind: 'voice', attachmentId: id}, {kind: 'sticker', stickerId: 'builtin:wave'}, {kind: 'share', target: {kind: 'post', id}}]) {
      expect(contracts.HumanMessageContentSchema.safeParse(content).success).toBe(true)
    }
    for (const content of [{kind: 'text', text: 'a'.repeat(4001)}, {kind: 'text', text: ' '.repeat(4000) + 'a'}, {kind: 'text', text: '  '}, {kind: 'image', attachmentId: 'bad'}, {kind: 'sticker', stickerId: 'a'.repeat(129)}, {kind: 'share', target: {kind: 'url', id}}, {kind: 'share', target: {kind: 'post', id: 'bad'}}]) {
      expect(contracts.HumanMessageContentSchema.safeParse(content).success).toBe(false)
    }
  })
  it('rejects zero, negative, fractional and unsafe message sequences', () => {
    for (const sequence of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) expect(contracts.HumanMessageSchema.safeParse({...message, sequence}).success).toBe(false)
    expect(contracts.HumanMessageSchema.safeParse({...message, id: 'bad'}).success).toBe(false)
  })
  it('validates zero-based read cursors and monotonic advances', () => {
    expect(contracts.HumanReadCursorSchema.safeParse({conversationId: id, profileId: peerId, lastReadSequence: 0}).success).toBe(true)
    expect(contracts.HumanReadInputSchema.safeParse({lastReadSequence: 10, profileId: peerId}).success).toBe(false)
    expect(contracts.HumanReadAdvanceSchema.safeParse({previousSequence: 10, nextSequence: 10}).success).toBe(true)
    expect(contracts.HumanReadAdvanceSchema.safeParse({previousSequence: 10, nextSequence: 9}).success).toBe(false)
  })
  it('validates versioned bounded realtime events', () => {
    const base = {v: 1, eventId: id, conversationId: id, occurredAt: now}
    for (const event of [{...base, type: 'message', message}, {...base, type: 'read', profileId: peerId, lastReadSequence: 1}, {...base, type: 'typing', profileId: peerId, isTyping: true}, {...base, type: 'presence', profileId: peerId, status: 'online'}, {...base, type: 'access_revoked', reason: 'blocked'}]) {
      expect(contracts.HumanRealtimeEventSchema.safeParse(event).success).toBe(true)
      expect(contracts.HumanRealtimeEventSchema.safeParse({...event, v: 2}).success).toBe(false)
      expect(contracts.HumanRealtimeEventSchema.safeParse({...event, eventId: 'a'.repeat(1000)}).success).toBe(false)
    }
    expect(contracts.HumanRealtimeEventSchema.safeParse({...base, type: 'message', message: {...message, conversationId: peerId}}).success).toBe(false)
  })
})
