import {randomUUID} from 'node:crypto'
import {ApiErrorSchema, ChatMessageResponseSchema} from '@aifans/contracts'
import {describe, expect, it} from 'vitest'
import {createApp} from '../application.js'
import {ChatProviderError, type ChatPort} from '../ports/chat.js'
import type {AuthVerifier} from '../ports/auth.js'
import type {ChatTargetPort} from '../ports/chat-target.js'
import type {ProfilePort} from '../ports/profiles.js'

const humanProfileId = randomUUID()
const ipProfileId = randomUUID()
const conversationId = randomUUID()
const messageId = randomUUID()
const identity = {subject: 'verified-human', email: 'human@example.com', displayName: 'Human'}
const auth = {verify: async () => ({status: 'authenticated', identity} as const)} satisfies AuthVerifier
const missingAuth = {verify: async () => ({status: 'missing'} as const)} satisfies AuthVerifier
const profiles = {
  ensureHumanProfile: async () => undefined,
  getCurrentAccount: async () => ({
    id: humanProfileId,
    kind: 'human' as const,
    username: 'verified_human',
    displayName: 'Human',
    preferredLocale: 'en' as const,
    creatorModeEnabled: false,
  }),
} satisfies ProfilePort
const result = {answer: 'Hello', conversationId, messageId, createdAt: '2026-09-01T12:00:00.000Z'}

function chatTargets(available = true, calls: unknown[] = []): ChatTargetPort {
  return {
    isPublicChatIp: async (actor, targetId) => {
      calls.push({actor, targetId})
      return available
    },
  }
}

function chat(calls: unknown[] = []): ChatPort {
  return {sendMessage: async (input) => { calls.push(input); return result }}
}

async function expectError(response: Response, status: number, code: string) {
  const body = ApiErrorSchema.parse(await response.json())
  expect(response.status).toBe(status)
  expect(body).toMatchObject({code, requestId: response.headers.get('x-request-id')})
  return body
}

describe('POST /v1/chat/:ipProfileId/messages', () => {
  it('returns 503 when chat is not configured', async () => {
    await expectError(await createApp({auth, profiles, chatTargets: chatTargets()}).request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'hi'}),
    }), 503, 'CHAT_NOT_CONFIGURED')
  })

  it('requires a verified human', async () => {
    await expectError(await createApp({auth: missingAuth, profiles, chatTargets: chatTargets(), chat: chat()}).request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'hi'}),
    }), 401, 'AUTH_REQUIRED')
    await expectError(await createApp({profiles, chatTargets: chatTargets(), chat: chat()}).request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'hi'}),
    }), 503, 'AUTH_NOT_CONFIGURED')
  })

  it('derives human, IP, locale, and request ID instead of accepting forged values', async () => {
    const calls: unknown[] = []
    const targetCalls: unknown[] = []
    const app = createApp({auth, profiles, chatTargets: chatTargets(true, targetCalls), chat: chat(calls)})
    const response = await app.request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-request-id': 'forged-request-id'},
      body: JSON.stringify({message: '  hello  '}),
    })

    expect(response.status).toBe(201)
    expect(ChatMessageResponseSchema.parse(await response.json())).toEqual(result)
    expect(calls).toEqual([{
      humanProfileId,
      ipProfileId,
      message: 'hello',
      locale: 'en',
      requestId: response.headers.get('x-request-id'),
    }])
    expect(targetCalls).toEqual([{actor: {subject: identity.subject}, targetId: ipProfileId}])
    expect(response.headers.get('x-request-id')).not.toBe('forged-request-id')

    await expectError(await app.request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({message: 'hello', user: randomUUID()}),
    }), 422, 'INVALID_REQUEST')
  })

  it('returns 200 for an existing conversation and honors a supported locale', async () => {
    const calls: unknown[] = []
    const response = await createApp({auth, profiles, chatTargets: chatTargets(), chat: chat(calls)}).request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({message: 'hello', conversationId, locale: 'zh-CN'}),
    })

    expect(response.status).toBe(200)
    expect(calls).toEqual([expect.objectContaining({conversationId, locale: 'zh-CN'})])
  })

  it.each([
    [`/v1/chat/not-a-uuid/messages`, JSON.stringify({message: 'hi'})],
    [`/v1/chat/${ipProfileId}/messages?actor=forged`, JSON.stringify({message: 'hi'})],
    [`/v1/chat/${ipProfileId}/messages`, JSON.stringify({message: '  '})],
    [`/v1/chat/${ipProfileId}/messages`, '{"message":"one","message":"two"}'],
    [`/v1/chat/${ipProfileId}/messages`, JSON.stringify({message: 'hi', locale: 'fr'})],
  ])('strictly rejects invalid path, query, or JSON body', async (path, body) => {
    const response = await createApp({auth, profiles, chatTargets: chatTargets(), chat: chat()}).request(path, {
      method: 'POST', headers: {'content-type': 'application/json'}, body,
    })
    await expectError(response, path.includes('not-a-uuid') || path.includes('?') ? 400 : 422, 'INVALID_REQUEST')
  })

  it('maps every provider failure to a safe correlated 502', async () => {
    const providerBody = 'secret provider response'
    const response = await createApp({auth, profiles, chatTargets: chatTargets(), chat: {
      sendMessage: async () => { throw new ChatProviderError(providerBody) },
    }}).request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'hi'}),
    })

    const raw = await response.clone().text()
    await expectError(response, 502, 'CHAT_PROVIDER_ERROR')
    expect(raw).not.toContain(providerBody)
  })

  it('rejects an untrusted or unavailable target before calling Dify', async () => {
    let providerCalls = 0
    await expectError(await createApp({
      auth,
      profiles,
      chatTargets: chatTargets(false),
      chat: {sendMessage: async () => { providerCalls += 1; return result }},
    }).request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'hi'}),
    }), 404, 'CHAT_TARGET_NOT_FOUND')
    expect(providerCalls).toBe(0)
  })

  it('requires a configured trusted target projection', async () => {
    await expectError(await createApp({auth, profiles, chat: chat()}).request(`/v1/chat/${ipProfileId}/messages`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'hi'}),
    }), 503, 'CHAT_TARGET_NOT_CONFIGURED')
  })
})
