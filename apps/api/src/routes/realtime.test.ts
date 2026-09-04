import {randomUUID} from 'node:crypto'
import {AccountSchema} from '@aifans/contracts'
import {describe, expect, it, vi} from 'vitest'
import {createApp, type AppDependencies} from '../application.js'

const profileId = randomUUID(), sessionId = randomUUID(), conversationId = randomUUID()
const origin = 'https://chat.example.test', secret = 'test-only-internal-credential-1234567890'
const identity = {subject: 'verified-subject', profileId}
const session = {...identity, sessionId, sessionExpiresAt: Date.now() + 60000}
const paths = {ticket: '/v1/realtime/ticket', redeem: '/v1/internal/realtime/redeem', authorize: '/v1/internal/realtime/authorize'}
const redeemBody = {ticket: 'test-ticket', origin}
const authorizeBody = {...identity, sessionId, conversationId}
function post(body: unknown = {}, headers: Record<string, string> = {}) {return {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)}}
function setup(overrides: Partial<AppDependencies> = {}) {
  const realtime = {issue: vi.fn(async () => 'test-ticket'), redeem: vi.fn(async () => session), authorize: vi.fn(async () => ({allowed: true, presenceAllowed: false}))}
  const profiles = {ensureHumanProfile: vi.fn(), getCurrentAccount: vi.fn(async () => AccountSchema.parse({id: profileId, kind: 'human', username: 'human_actor', displayName: 'Human', preferredLocale: 'en', creatorModeEnabled: false}))}
  const auth = {verify: vi.fn(async () => ({status: 'authenticated', identity: {subject: identity.subject}} as const))}
  const logger = {info: vi.fn(), error: vi.fn()}
  return {realtime, profiles, auth, logger, app: createApp({realtime, profiles, auth, logger, realtimeAllowedOrigins: [origin], realtimeInternalSecret: secret, ...overrides})}
}

describe('realtime authorization routes', () => {
  it('supports the ticket identity contract subject limit of 512 characters', async () => {
    const longSubject = 's'.repeat(512)
    const {app, realtime} = setup({auth: {verify: async () => ({status: 'authenticated', identity: {subject: longSubject}})}})
    expect((await app.request(paths.ticket, post({}, {origin}))).status).toBe(200)
    expect(realtime.issue).toHaveBeenCalledWith({subject: longSubject, profileId}, origin)
  })
  it('issues from verified identity and the actual allowlisted origin', async () => {
    const {app, realtime} = setup()
    const response = await app.request(paths.ticket, post({}, {origin}))
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ticket: 'test-ticket'})
    expect(realtime.issue).toHaveBeenCalledWith(identity, origin)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('authenticates before validating payload and never provisions a profile', async () => {
    const {app, profiles, realtime} = setup({auth: {verify: async () => ({status: 'invalid'})}})
    expect((await app.request(paths.ticket, {method: 'POST', body: '{'})).status).toBe(401)
    expect(profiles.getCurrentAccount).not.toHaveBeenCalled(); expect(profiles.ensureHumanProfile).not.toHaveBeenCalled(); expect(realtime.issue).not.toHaveBeenCalled()
  })
  it('requires a current human account', async () => {
    const {app, profiles, realtime} = setup()
    profiles.getCurrentAccount.mockResolvedValue(AccountSchema.parse({id: profileId, kind: 'ip', username: 'ip_actor', displayName: 'IP', preferredLocale: 'en', creatorModeEnabled: false}))
    expect((await app.request(paths.ticket, post({}, {origin}))).status).toBe(403)
    expect(realtime.issue).not.toHaveBeenCalled()
  })
  it('requires exact actual Origin and rejects body-spoofed identity and origins', async () => {
    const {app, realtime} = setup()
    for (const value of [undefined, 'null', 'https://evil.test', origin + '/', origin + '.evil.test', origin + ', https://evil.test']) {
      expect((await app.request(paths.ticket, post({}, value ? {origin: value} : {}))).status).toBe(403)
    }
    for (const body of [{subject: 'forged'}, {profileId}, {origin}]) expect((await app.request(paths.ticket, post(body, {origin}))).status).toBe(422)
    expect(realtime.issue).not.toHaveBeenCalled()
  })
  it('fails closed with missing service, origins, auth, and internal credentials', async () => {
    for (const options of [{realtime: undefined}, {auth: undefined}, {realtimeAllowedOrigins: []}, {realtimeAllowedOrigins: ['https://example.test/path']}]) {
      const {app} = setup(options); expect((await app.request(paths.ticket, post({}, {origin}))).status).toBe(503)
    }
    for (const realtimeInternalSecret of [undefined, '', 'short', ' '.repeat(40)]) {
      const {app, realtime} = setup({realtimeInternalSecret})
      expect((await app.request(paths.redeem, post(redeemBody, {authorization: `Bearer ${secret}`}))).status).toBe(503)
      expect(realtime.redeem).not.toHaveBeenCalled()
    }
  })
  it('requires the exact internal bearer before parsing or calling a port', async () => {
    const {app, realtime} = setup()
    for (const path of [paths.redeem, paths.authorize]) for (const authorization of ['', `Basic ${secret}`, `Bearer ${secret}x`, `Bearer ${secret.slice(1)}`, `Bearer ${'x'.repeat(secret.length)}`]) {
      const response = await app.request(path, {method: 'POST', headers: {authorization}, body: '{'})
      expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(realtime.redeem).not.toHaveBeenCalled(); expect(realtime.authorize).not.toHaveBeenCalled()
  })
  it('redeems and authorizes strictly typed callbacks using only the independent bearer', async () => {
    const {app, realtime, auth} = setup()
    expect(await (await app.request(paths.redeem, post(redeemBody, {authorization: `Bearer ${secret}`}))).json()).toEqual(session)
    expect(realtime.redeem).toHaveBeenCalledWith(redeemBody)
    expect(await (await app.request(paths.authorize, post({...authorizeBody, eventType: 'typing'}, {authorization: `Bearer ${secret}`}))).json()).toEqual({allowed: true, presenceAllowed: false})
    expect(realtime.authorize).toHaveBeenCalledWith({...authorizeBody, eventType: 'typing'}); expect(auth.verify).not.toHaveBeenCalled()
  })
  it('rejects unknown, duplicate and malformed callback inputs without storage', async () => {
    const {app, realtime} = setup()
    for (const body of [{...redeemBody, subject: 'forged'}, {...redeemBody, ticket: ''}, {...redeemBody, ticket: 'x'.repeat(4097)}, {...redeemBody, origin: 'null'}]) expect((await app.request(paths.redeem, post(body, {authorization: `Bearer ${secret}`}))).status).toBe(422)
    for (const body of [{...authorizeBody, sessionExpiresAt: session.sessionExpiresAt}, {...authorizeBody, sessionId: 'bad'}, {...authorizeBody, eventType: 'evil'}, {...authorizeBody, subject: ''}]) expect((await app.request(paths.authorize, post(body, {authorization: `Bearer ${secret}`}))).status).toBe(422)
    expect((await app.request(paths.redeem, {method: 'POST', headers: {authorization: `Bearer ${secret}`}, body: '{"ticket":"a","ticket":"b","origin":"https://chat.example.test"}'})).status).toBe(422)
    for (const path of Object.values(paths)) expect((await app.request(path + '?ticket=forged', post({}, {origin, authorization: `Bearer ${secret}`}))).status).toBe(422)
    expect(realtime.redeem).not.toHaveBeenCalled(); expect(realtime.authorize).not.toHaveBeenCalled(); expect(realtime.issue).not.toHaveBeenCalled()
  })
  it('redacts ticket verification errors and all secrets from logs', async () => {
    const {app, realtime, logger} = setup()
    realtime.redeem.mockRejectedValue(new Error('INVALID_REALTIME_TICKET'))
    const denied = await app.request(paths.redeem, post(redeemBody, {authorization: `Bearer ${secret}`}))
    expect(denied.status).toBe(401)
    realtime.issue.mockRejectedValue(new Error('SECRET ticket=highly-sensitive'))
    const failed = await app.request(paths.ticket, post({}, {origin})); expect(failed.status).toBe(500)
    expect(await failed.text()).not.toContain('SECRET')
    expect(JSON.stringify([logger.info.mock.calls, logger.error.mock.calls])).not.toMatch(/test-ticket|highly-sensitive|test-only-internal/)
  })
  it('validates outputs and makes early body errors private', async () => {
    const {app, realtime} = setup()
    realtime.authorize.mockResolvedValue({allowed: true, presenceAllowed: 'bad'} as never)
    expect((await app.request(paths.authorize, post(authorizeBody, {authorization: `Bearer ${secret}`}))).status).toBe(500)
    realtime.redeem.mockResolvedValue({...session, sessionId: 'bad'})
    expect((await app.request(paths.redeem, post(redeemBody, {authorization: `Bearer ${secret}`}))).status).toBe(500)
    for (const path of Object.values(paths)) {
      const response = await app.request(path, post({text: 'x'.repeat(70000)})); expect(response.status).toBe(413); expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
  })
})
