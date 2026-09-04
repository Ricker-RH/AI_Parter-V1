import type {HumanInboxPage, HumanMessage, HumanRealtimeEvent} from '@aifans/contracts'

export function mergeHumanHistory(current: HumanMessage[], incoming: HumanMessage): HumanMessage[] {
  const existing = current.find((message) => message.id === incoming.id)
  if (existing && JSON.stringify(existing) === JSON.stringify(incoming)) return current
  return [...current.filter((message) => message.id !== incoming.id), incoming]
    .sort((left, right) => left.sequence - right.sequence)
}

export function mergeHumanInboxEvent(current: HumanInboxPage['items'], incoming: HumanMessage): HumanInboxPage['items'] {
  let changed = false
  const next = current.map((item) => {
    if (item.conversation.id !== incoming.conversationId) return item
    if (item.latestMessage?.id === incoming.id && JSON.stringify(item.latestMessage) === JSON.stringify(incoming)) return item
    changed = true
    return {
      ...item,
      conversation: {...item.conversation, updatedAt: incoming.createdAt},
      latestMessage: incoming,
    }
  })
  if (!changed) return current
  return next.sort((left, right) => right.conversation.updatedAt.localeCompare(left.conversation.updatedAt) || left.conversation.id.localeCompare(right.conversation.id))
}

export function mergeReadCursor(current: HumanInboxPage['items'], event: Extract<HumanRealtimeEvent, {type: 'read'}>): HumanInboxPage['items'] {
  let changed = false
  const next = current.map((item) => {
    if (item.conversation.id !== event.conversationId || event.lastReadSequence <= item.lastReadSequence) return item
    changed = true
    return {...item, lastReadSequence: event.lastReadSequence}
  })
  return changed ? next : current
}
