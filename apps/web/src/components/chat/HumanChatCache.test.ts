import type {HumanInboxPage, HumanMessage} from '@aifans/contracts'
import {expect, it} from 'vitest'
import {mergeHumanHistory, mergeHumanInboxEvent} from './human-chat-cache.js'

const self = '11111111-1111-4111-8111-111111111111'
const peer = '22222222-2222-4222-8222-222222222222'
const firstConversation = '33333333-3333-4333-8333-333333333333'
const secondConversation = '44444444-4444-4444-8444-444444444444'

function message(input: Partial<HumanMessage> & Pick<HumanMessage, 'id' | 'sequence'>): HumanMessage {
  return {
    v: 1,
    id: input.id,
    conversationId: input.conversationId ?? firstConversation,
    senderProfileId: input.senderProfileId ?? peer,
    clientRequestId: input.clientRequestId ?? input.id,
    sequence: input.sequence,
    createdAt: input.createdAt ?? `2026-09-04T00:00:0${input.sequence}.000Z`,
    content: input.content ?? {kind: 'text', text: `message-${input.sequence}`},
  }
}

function inboxItem(id: string, latestMessage: HumanMessage | null): HumanInboxPage['items'][number] {
  return {
    conversation: {
      v: 1,
      id,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: latestMessage?.createdAt ?? '2026-09-04T00:00:00.000Z',
      participants: [
        {kind: 'HUMAN', id: self, displayName: 'Self', username: 'self', avatarUrl: null},
        {kind: 'HUMAN', id: peer, displayName: 'Peer', username: 'peer', avatarUrl: null},
      ],
    },
    latestMessage,
    unreadCount: 0,
    lastReadSequence: 0,
  }
}

it('preserves unchanged history references while appending a newer realtime message', () => {
  const first = message({id: '55555555-5555-4555-8555-555555555555', sequence: 1})
  const second = message({id: '66666666-6666-4666-8666-666666666666', sequence: 2})

  const merged = mergeHumanHistory([first], second)

  expect(merged).toEqual([first, second])
  expect(merged[0]).toBe(first)
  expect(mergeHumanHistory(merged, second)).toBe(merged)
})

it('updates only the matching inbox summary for a realtime message', () => {
  const untouched = inboxItem(firstConversation, null)
  const target = inboxItem(secondConversation, null)
  const incoming = message({
    id: '77777777-7777-4777-8777-777777777777',
    conversationId: secondConversation,
    sequence: 3,
    createdAt: '2026-09-04T00:00:03.000Z',
  })

  const merged = mergeHumanInboxEvent([untouched, target], incoming)

  expect(merged).toHaveLength(2)
  expect(merged.find((item) => item.conversation.id === firstConversation)).toBe(untouched)
  expect(merged[0]?.conversation.id).toBe(secondConversation)
  expect(merged[0]?.latestMessage).toBe(incoming)
})
