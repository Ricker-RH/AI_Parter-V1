import {randomUUID} from 'node:crypto'
import {ApiErrorSchema, ChatConversationPageSchema, ChatConversationSummarySchema, ChatHistoryPageSchema, encodeChatConversationCursor, encodeChatMessageCursor} from '@aifans/contracts'
import {describe, expect, it, vi} from 'vitest'
import {createApp} from '../application.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ChatPort} from '../ports/chat.js'
import type {ChatTargetPort} from '../ports/chat-target.js'
import type {ChatRepositoryPort} from '../ports/chat-repository.js'
import type {ProfilePort} from '../ports/profiles.js'

const humanProfileId = randomUUID(), ipProfileId = randomUUID(), conversationId = randomUUID(), otherConversationId = randomUUID(), requestId = randomUUID(), humanMessageId = randomUUID(), assistantMessageId = randomUUID()
const identity = {subject: 'verified-human', email: 'human@example.com', displayName: 'Human'}
const auth = {verify: async () => ({status: 'authenticated', identity} as const)} satisfies AuthVerifier
const missingAuth = {verify: async () => ({status: 'missing'} as const)} satisfies AuthVerifier
const profiles = {ensureHumanProfile: async () => undefined, getCurrentAccount: async () => ({id: humanProfileId, kind: 'human' as const, username: 'verified_human', displayName: 'Human', preferredLocale: 'en' as const, creatorModeEnabled: false})} satisfies ProfilePort
const stamp = '2026-09-02T12:00:00.000Z'
const humanMessage = {id: humanMessageId, role: 'human' as const, body: 'Hello', deliveryState: 'pending' as const, createdAt: stamp}
const sentHumanMessage = {...humanMessage, deliveryState: 'sent' as const}
const assistantMessage = {id: assistantMessageId, role: 'assistant' as const, body: 'Hi there', deliveryState: 'sent' as const, createdAt: stamp}
const summary = {id: conversationId, ipProfile: {id: ipProfileId, username: 'public_ip', displayName: 'Public IP'}, lastMessage: null, updatedAt: stamp, sendEnabled: true}

function targets(available = true, calls: unknown[] = []): ChatTargetPort { return {isPublicChatIp: async (actor, targetId) => { calls.push({actor, targetId}); return available }} }
function repository(overrides: Partial<ChatRepositoryPort> = {}): ChatRepositoryPort {
  return {listConversations: async () => ({items: [summary], nextCursor: null}), getOrCreateConversation: async () => summary, getConversation: async () => summary, listMessages: async () => ({conversation: summary, items: [sentHumanMessage], nextCursor: null}), beginHumanMessage: async () => ({type: 'ready', humanProfileId, ipProfileId, humanMessage}), completeProviderReply: async () => ({humanMessage: sentHumanMessage, assistantMessage}), failHumanMessage: async () => true, ...overrides}
}
function provider(deltas: string[] = ['Hi', ' there'], calls: unknown[] = []): ChatPort { return {streamMessage: async function* (input) { calls.push(input); for (const delta of deltas) yield {type: 'delta', delta}; return {answer: deltas.join(''), providerConversationId: 'private-conversation-id', providerMessageId: 'private-message-id'} }} }
async function expectError(response: Response, status: number, code: string) { const body = ApiErrorSchema.parse(await response.json()); expect(response.status).toBe(status); expect(body).toMatchObject({code, requestId: response.headers.get('x-request-id')}) }
function events(text: string): unknown[] { return text.trim().split('\n\n').map((frame) => JSON.parse(frame.slice('data: '.length))) }
function dependencies(overrides: Parameters<typeof createApp>[0] = {}) { return {auth, profiles, conversations: repository(), ...overrides} }

describe('persistent chat conversations', () => {
  it('lists persistent conversations without a provider and passes validated pagination/send state', async () => {
    const calls: unknown[] = []
    const conversations = repository({
      listConversations: async (actor, input) => {
        calls.push({actor, input})
        return {items: [summary], nextCursor: null}
      },
    })
    const response = await createApp(dependencies({conversations})).request('/v1/chat/conversations?limit=1')
    expect(response.status).toBe(200); expect(ChatConversationPageSchema.parse(await response.json())).toEqual({items: [summary], nextCursor: null}); expect(calls).toEqual([{actor: {subject: identity.subject}, input: {limit: 1, sendEnabled: false}}])
  })
  it('uses endpoint pagination defaults and caps both limits at 100', async () => {
    const calls: unknown[] = []
    const conversations = repository({
      listConversations: async (_actor, input) => { calls.push(input); return {items: [], nextCursor: null} },
      listMessages: async (_actor, input) => { calls.push(input); return {conversation: summary, items: [], nextCursor: null} },
    })
    expect((await createApp(dependencies({conversations})).request('/v1/chat/conversations')).status).toBe(200)
    expect((await createApp(dependencies({conversations})).request(`/v1/chat/conversations/${conversationId}/messages`)).status).toBe(200)
    expect(calls).toEqual([{limit: 20, sendEnabled: false}, {conversationId, limit: 50, sendEnabled: false}])
    await expectError(await createApp(dependencies({conversations})).request('/v1/chat/conversations?limit=101'), 400, 'INVALID_REQUEST')
    await expectError(await createApp(dependencies({conversations})).request(`/v1/chat/conversations/${conversationId}/messages?limit=101`), 400, 'INVALID_REQUEST')
  })
  it('creates an owner conversation only for a public target and returns the durable DTO', async () => {
    const targetCalls: unknown[] = [], calls: unknown[] = []
    const response = await createApp(dependencies({chatTargets: targets(true, targetCalls), conversations: repository({getOrCreateConversation: async (actor, input) => { calls.push({actor, input}); return summary}})})).request('/v1/chat/conversations', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ipProfileId})})
    expect(response.status).toBe(200); expect(ChatConversationSummarySchema.parse(await response.json())).toEqual(summary); expect(targetCalls).toEqual([{actor: {subject: identity.subject}, targetId: ipProfileId}]); expect(calls).toEqual([{actor: {subject: identity.subject}, input: {humanProfileId, ipProfileId, sendEnabled: false}}])
  })
  it('maps a vanished target projection during idempotent create to target not found', async () => {
    await expectError(await createApp(dependencies({chatTargets: targets(), conversations: repository({getOrCreateConversation: async () => null})})).request('/v1/chat/conversations', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ipProfileId})}), 404, 'CHAT_TARGET_NOT_FOUND')
  })
  it('returns a history DTO and maps owner-inaccessible conversations to 404', async () => {
    const response = await createApp(dependencies()).request(`/v1/chat/conversations/${conversationId}/messages?limit=50`)
    expect(response.status).toBe(200); expect(ChatHistoryPageSchema.parse(await response.json())).toEqual({conversation: summary, items: [sentHumanMessage], nextCursor: null})
    await expectError(await createApp(dependencies({conversations: repository({listMessages: async () => null})})).request(`/v1/chat/conversations/${otherConversationId}/messages`), 404, 'CHAT_CONVERSATION_NOT_FOUND')
  })
  it('validates auth and storage before target/provider configuration', async () => {
    await expectError(await createApp({auth: missingAuth, profiles, conversations: repository()}).request('/v1/chat/conversations'), 401, 'AUTH_REQUIRED')
    await expectError(await createApp({auth, profiles}).request('/v1/chat/conversations'), 503, 'CHAT_STORAGE_NOT_CONFIGURED')
    await expectError(await createApp(dependencies()).request('/v1/chat/conversations', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ipProfileId})}), 503, 'CHAT_TARGET_NOT_CONFIGURED')
    await expectError(await createApp(dependencies()).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})}), 503, 'CHAT_NOT_CONFIGURED')
  })
  it.each([
    ['/v1/chat/conversations?limit=0', undefined],
    ['/v1/chat/conversations?limit=0', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{not-json'}],
    ['/v1/chat/conversations/not-a-uuid/messages?limit=0', undefined],
    ['/v1/chat/conversations/not-a-uuid/messages?bad=1', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{not-json'}],
  ] as const)('authenticates before validating malformed input: %s', async (path, init) => {
    await expectError(await createApp({auth: missingAuth, profiles}).request(path, init), 401, 'AUTH_REQUIRED')
  })
  it.each(['/v1/chat/conversations?limit=0', '/v1/chat/conversations?limit=1&limit=2', '/v1/chat/conversations?unknown=1', `/v1/chat/conversations?cursor=${'x'.repeat(1100)}`, '/v1/chat/conversations/not-a-uuid/messages', `/v1/chat/conversations/${conversationId}/messages?limit=nope`])('strictly rejects invalid paths and queries: %s', async (path) => { await expectError(await createApp(dependencies()).request(path), 400, 'INVALID_REQUEST') })
  it.each([
    `/v1/chat/conversations?cursor=abc`,
    `/v1/chat/conversations?cursor=${Buffer.from(JSON.stringify({kind: 'chat-conversations', v: 1, updatedAt: stamp, id: conversationId})).toString('base64url')}`,
    `/v1/chat/conversations?cursor=${encodeChatMessageCursor({v: 1, kind: 'chat-messages', createdAt: stamp, id: humanMessageId})}`,
    `/v1/chat/conversations/${conversationId}/messages?cursor=abc`,
    `/v1/chat/conversations/${conversationId}/messages?cursor=${Buffer.from(JSON.stringify({kind: 'chat-messages', v: 1, createdAt: stamp, id: humanMessageId})).toString('base64url')}`,
    `/v1/chat/conversations/${conversationId}/messages?cursor=${encodeChatConversationCursor({v: 1, kind: 'chat-conversations', updatedAt: stamp, id: conversationId})}`,
  ])('rejects malformed, noncanonical, or cross-kind cursors before storage: %s', async (path) => {
    const calls: unknown[] = []
    const conversations = repository({listConversations: async () => { calls.push('list'); return {items: [], nextCursor: null} }, listMessages: async () => { calls.push('history'); return {conversation: summary, items: [], nextCursor: null} }})
    await expectError(await createApp(dependencies({conversations})).request(path), 400, 'INVALID_REQUEST')
    expect(calls).toEqual([])
  })
  it.each(['{"ipProfileId":"' + ipProfileId + '","ipProfileId":"' + ipProfileId + '"}', JSON.stringify({ipProfileId, forged: true})])('strictly rejects invalid create bodies', async (body) => { await expectError(await createApp(dependencies({chatTargets: targets()})).request('/v1/chat/conversations', {method: 'POST', headers: {'content-type': 'application/json'}, body}), 422, 'INVALID_REQUEST') })
  it.each(['{"message":"Hello","message":"No","requestId":"' + requestId + '"}', JSON.stringify({message: 'Hello', requestId, conversationId}), JSON.stringify({message: 'Hello', requestId: 'not-a-uuid'})])('strictly rejects invalid send bodies', async (body) => { await expectError(await createApp(dependencies({chat: provider()})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body}), 422, 'INVALID_REQUEST') })
  it('streams a completed replay without contacting Dify', async () => {
    const calls: unknown[] = []
    const response = await createApp(dependencies({chat: provider([], calls), conversations: repository({beginHumanMessage: async () => ({type: 'complete', response: {humanMessage: sentHumanMessage, assistantMessage}})})})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8'); expect(response.headers.get('cache-control')).toBe('no-cache/no-transform'); expect(events(await response.text())).toEqual([{type: 'human_message', message: sentHumanMessage}, {type: 'assistant_complete', message: assistantMessage}]); expect(calls).toEqual([])
  })
  it.each([['conflict', 409, 'CHAT_REQUEST_CONFLICT'], ['inflight', 409, 'CHAT_IN_PROGRESS']] as const)('maps begin %s safely', async (type, status, code) => { await expectError(await createApp(dependencies({chat: provider(), conversations: repository({beginHumanMessage: async () => ({type})})})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})}), status, code) })
  it('maps a missing owner conversation to 404 without contacting the provider', async () => {
    const calls: unknown[] = []
    await expectError(await createApp(dependencies({chat: provider([], calls), conversations: repository({beginHumanMessage: async () => null})})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})}), 404, 'CHAT_CONVERSATION_NOT_FOUND')
    expect(calls).toEqual([])
  })
  it('streams validated events in order and persists completion before emitting it', async () => {
    const order: string[] = [], calls: unknown[] = []
    const response = await createApp(dependencies({chat: provider(['Hi', ' there'], calls), conversations: repository({completeProviderReply: async (_actor, input) => { order.push('complete'); expect(input).toMatchObject({conversationId, humanMessageId, answer: 'Hi there', providerConversationId: 'private-conversation-id', providerMessageId: 'private-message-id'}); return {humanMessage: sentHumanMessage, assistantMessage} }})})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId, locale: 'zh-CN'})})
    const body = await response.text(); expect(events(body)).toEqual([{type: 'human_message', message: humanMessage}, {type: 'assistant_delta', delta: 'Hi'}, {type: 'assistant_delta', delta: ' there'}, {type: 'assistant_complete', message: assistantMessage}]); expect(order).toEqual(['complete']); expect(calls).toEqual([expect.objectContaining({humanProfileId, ipProfileId, message: 'Hello', locale: 'zh-CN', requestId: response.headers.get('x-request-id'), signal: expect.any(AbortSignal)})]); expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/); expect(response.headers.get('x-request-id')).not.toBe(requestId); expect(body).not.toContain('private-conversation-id'); expect(body).not.toContain('private-message-id')
  })
  it.each([
    {name: 'cumulative deltas exceed 4000', chat: provider(['x'.repeat(3000), 'y'.repeat(1001)])},
    {name: 'terminal answer differs from deltas', chat: {streamMessage: async function* () { yield {type: 'delta', delta: 'shown'}; return {answer: 'different', providerConversationId: 'private-conversation-id', providerMessageId: 'private-message-id'} }} satisfies ChatPort},
    {name: 'provider id exceeds its bound', chat: {streamMessage: async function* () { yield {type: 'delta', delta: 'ok'}; return {answer: 'ok', providerConversationId: 'x'.repeat(513), providerMessageId: 'private-message-id'} }} satisfies ChatPort},
  ])('rejects bounded provider output when $name', async ({chat}) => {
    const failures: unknown[] = []
    const response = await createApp(dependencies({chat, conversations: repository({failHumanMessage: async (_actor, input) => { failures.push(input); return true }})})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})
    expect(events(await response.text()).at(-1)).toEqual({type: 'failed', code: 'CHAT_PROVIDER_ERROR'})
    expect(failures).toEqual([{conversationId, humanMessageId}])
  })
  it('fails the accepted row and emits only a safe SSE failure for provider errors', async () => {
    const failures: unknown[] = [], failed = repository({failHumanMessage: async (_actor, input) => { failures.push(input); return true }}), boom = {streamMessage: async function* () { throw new Error('provider secret') }} satisfies ChatPort
    const response = await createApp(dependencies({chat: boom, conversations: failed})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})
    const body = await response.text(); expect(events(body)).toEqual([{type: 'human_message', message: humanMessage}, {type: 'failed', code: 'CHAT_PROVIDER_ERROR'}]); expect(failures).toEqual([{conversationId, humanMessageId}]); expect(body).not.toContain('provider secret')
  })
  it('marks the human row failed when durable completion fails', async () => {
    const failures: unknown[] = []
    const response = await createApp(dependencies({chat: provider(), conversations: repository({completeProviderReply: async () => { throw new Error('database secret') }, failHumanMessage: async (_actor, input) => { failures.push(input); return true }})})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})
    expect(events(await response.text()).at(-1)).toEqual({type: 'failed', code: 'CHAT_PROVIDER_ERROR'})
    expect(failures).toEqual([{conversationId, humanMessageId}])
  })
  it('retries failure persistence and emits failed only after it succeeds', async () => {
    let attempts = 0
    const conversations = repository({failHumanMessage: async () => { attempts += 1; if (attempts === 1) throw new Error('database secret'); return attempts === 3 }})
    const response = await createApp(dependencies({chat: {streamMessage: async function* () { throw new Error('provider secret') }} satisfies ChatPort, conversations})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})
    expect(events(await response.text()).at(-1)).toEqual({type: 'failed', code: 'CHAT_PROVIDER_ERROR'})
    expect(attempts).toBe(3)
  })
  it('errors the stream safely instead of claiming failure when failure persistence stays unavailable', async () => {
    const onUnhandledError = vi.fn()
    const conversations = repository({failHumanMessage: async () => { throw new Error('database secret') }})
    const response = await createApp(dependencies({chat: {streamMessage: async function* () { throw new Error('provider secret') }} satisfies ChatPort, conversations, onUnhandledError})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})
    await expect(response.text()).rejects.toThrow('Chat failure persistence failed')
    expect(onUnhandledError).toHaveBeenCalledWith({name: 'ChatFailurePersistenceError', code: 'CHAT_FAILURE_PERSISTENCE_FAILED', requestId: response.headers.get('x-request-id'), conversationId})
    expect(JSON.stringify(onUnhandledError.mock.calls)).not.toMatch(/database secret|provider secret|Hello|verified-human|humanMessageId/)
  })
  it('does not emit or persist provider output yielded after cancellation', async () => {
    const caller = new AbortController(), failures: unknown[] = [], completions: unknown[] = []
    const chat = {streamMessage: async function* () { caller.abort(); yield {type: 'delta', delta: 'too late'}; return {answer: 'too late', providerConversationId: 'private-conversation-id', providerMessageId: 'private-message-id'} }} satisfies ChatPort
    const conversations = repository({completeProviderReply: async (_actor, input) => { completions.push(input); return {humanMessage: sentHumanMessage, assistantMessage} }, failHumanMessage: async (_actor, input) => { failures.push(input); return true }})
    const response = await createApp(dependencies({chat, conversations})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId}), signal: caller.signal})
    expect(events(await response.text())).toEqual([{type: 'human_message', message: humanMessage}, {type: 'failed', code: 'CHAT_INTERRUPTED'}])
    expect(completions).toEqual([]); expect(failures).toEqual([{conversationId, humanMessageId}])
  })
  it('does not complete when cancellation races with the provider terminal result', async () => {
    const caller = new AbortController(), completions: unknown[] = []
    const chat = {streamMessage: async function* () { yield {type: 'delta', delta: 'done'}; caller.abort(); return {answer: 'done', providerConversationId: 'private-conversation-id', providerMessageId: 'private-message-id'} }} satisfies ChatPort
    const conversations = repository({completeProviderReply: async (_actor, input) => { completions.push(input); return {humanMessage: sentHumanMessage, assistantMessage} }})
    const response = await createApp(dependencies({chat, conversations})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId}), signal: caller.signal})
    expect(events(await response.text()).at(-1)).toEqual({type: 'failed', code: 'CHAT_INTERRUPTED'})
    expect(completions).toEqual([])
  })
  it('emits durable assistant_complete when cancellation arrives during completion persistence', async () => {
    const caller = new AbortController(), failures: unknown[] = []
    const conversations = repository({
      completeProviderReply: async () => { caller.abort(); return {humanMessage: sentHumanMessage, assistantMessage} },
      failHumanMessage: async (_actor, input) => { failures.push(input); return true },
    })
    const response = await createApp(dependencies({chat: provider(), conversations})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId}), signal: caller.signal})
    expect(events(await response.text()).at(-1)).toEqual({type: 'assistant_complete', message: assistantMessage})
    expect(failures).toEqual([])
  })
  it('aborts a compliant provider, runs iterator cleanup, and marks the human row failed when the stream is cancelled', async () => {
    let markFailed!: () => void, markCleaned!: () => void
    const failed = new Promise<void>((resolve) => { markFailed = resolve })
    const cleaned = new Promise<void>((resolve) => { markCleaned = resolve })
    let providerSignal: AbortSignal | undefined
    const cancelling = {
      streamMessage: async function* (input) {
        providerSignal = input.signal
        try {
          if (false) yield {type: 'delta' as const, delta: 'unreachable'}
          await new Promise<void>((_resolve, reject) => input.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), {once: true}))
          return {answer: 'unreachable', providerConversationId: 'private-conversation-id', providerMessageId: 'private-message-id'}
        } finally { markCleaned() }
      },
    } satisfies ChatPort
    const conversations = repository({failHumanMessage: async () => { markFailed(); return true }})
    const response = await createApp(dependencies({chat: cancelling, conversations})).request(`/v1/chat/conversations/${conversationId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('human_message')
    await reader.cancel('client left')
    await Promise.all([failed, cleaned])
    expect(providerSignal?.aborted).toBe(true)
  })
  it('removes the legacy direct-to-IP send route', async () => {
    expect((await createApp(dependencies({chat: provider(), chatTargets: targets()})).request(`/v1/chat/${ipProfileId}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Hello', requestId})})).status).toBe(404)
  })
  it('normalizes repository exceptions and rejects untrusted targets', async () => {
    await expectError(await createApp(dependencies({conversations: repository({listConversations: async () => { throw new Error('database secret') }})})).request('/v1/chat/conversations'), 500, 'INTERNAL_ERROR')
    await expectError(await createApp(dependencies({chatTargets: targets(false)})).request('/v1/chat/conversations', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ipProfileId})}), 404, 'CHAT_TARGET_NOT_FOUND')
  })
})
