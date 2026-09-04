import {randomUUID} from 'node:crypto'
import {AccountSchema, HumanProfileSchema} from '@aifans/contracts'
import {describe, expect, it, vi} from 'vitest'
import {createApp, type AppDependencies} from '../application.js'

const profileId = randomUUID(), viewerId = randomUUID(), actor = {subject: 'verified-human'}
const path = `/v1/humans/${profileId}`
const locked = {state: 'locked'}
const profile = HumanProfileSchema.parse({v: 1, identity: {kind: 'HUMAN', id: profileId, username: 'test_human', displayName: 'Human', avatarUrl: null}, visibility: 'private', isOwner: false, relationship: {following: false, followedBy: false, blockedByViewer: false, canMessage: false, messageDisabledReason: 'authentication_required'}, tabs: {ips: locked, liked: locked, saved: locked, following: locked}})
function setup(overrides: Partial<AppDependencies> = {}) {
  const humanSocial = {getPublicProfile: vi.fn(async () => profile), setPreferences: vi.fn(async () => ({visibility: 'private' as const, showPresence: false})), follow: vi.fn(async () => ({changed: true})), unfollow: vi.fn(async () => ({changed: true})), block: vi.fn(async () => ({changed: true})), unblock: vi.fn(async () => ({changed: true}))}
  const profiles = {ensureHumanProfile: vi.fn(), getCurrentAccount: vi.fn(async () => AccountSchema.parse({id: viewerId, kind: 'human', username: 'test_viewer', displayName: 'Viewer', preferredLocale: 'en', creatorModeEnabled: false}))}
  const auth = {verify: vi.fn(async () => ({status: 'authenticated', identity: actor} as const))}
  return {humanSocial, profiles, app: createApp({humanSocial, profiles, auth, ...overrides})}
}
const body = (method: string, value: unknown = {}) => ({method, headers: {'content-type': 'application/json'}, body: JSON.stringify(value)})

describe('human social routes', () => {
  it('returns private locked profile metadata to anonymous viewers', async () => {
    const {app, humanSocial} = setup({auth: {verify: async () => ({status: 'missing'})}})
    const response = await app.request(path)
    expect(response.status).toBe(200); expect(await response.json()).toEqual(profile)
    expect(humanSocial.getPublicProfile).toHaveBeenCalledWith({viewer: null, profileId})
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('passes verified viewers and never falls back to anonymous for invalid credentials', async () => {
    const valid = setup(); expect((await valid.app.request(path)).status).toBe(200)
    expect(valid.humanSocial.getPublicProfile).toHaveBeenCalledWith({viewer: actor, profileId})
    const invalid = setup({auth: {verify: async () => ({status: 'invalid'})}})
    expect((await invalid.app.request(path + '?invalid=yes')).status).toBe(401)
    expect(invalid.humanSocial.getPublicProfile).not.toHaveBeenCalled()
  })
  it('uses current human identity for preferences and all four mutations', async () => {
    const {app, humanSocial, profiles} = setup()
    const response = await app.request('/v1/human-preferences', body('PATCH', {visibility: 'private', showPresence: false}))
    expect(response.status).toBe(200); expect(await response.json()).toEqual({visibility: 'private', showPresence: false})
    expect(humanSocial.setPreferences).toHaveBeenCalledWith(actor, {visibility: 'private', showPresence: false})
    for (const [method, relation, operation] of [['PUT', 'follow', 'follow'], ['DELETE', 'follow', 'unfollow'], ['PUT', 'block', 'block'], ['DELETE', 'block', 'unblock']] as const) {
      expect(await (await app.request(`${path}/${relation}`, body(method))).json()).toEqual({changed: true})
      expect(humanSocial[operation]).toHaveBeenCalledWith(actor, profileId)
    }
    expect(profiles.getCurrentAccount).toHaveBeenCalledWith(actor); expect(profiles.ensureHumanProfile).not.toHaveBeenCalled()
  })
  it('authenticates before invalid mutation input and requires current human accounts', async () => {
    for (const status of ['missing', 'invalid'] as const) {
      const {app, profiles, humanSocial} = setup({auth: {verify: async () => ({status})}})
      expect((await app.request('/v1/human-preferences', {method: 'PATCH', body: '{'})).status).toBe(401)
      expect((await app.request(`${path}/block`, body('PUT', {senderId: viewerId}))).status).toBe(401)
      expect(profiles.getCurrentAccount).not.toHaveBeenCalled(); expect(humanSocial.block).not.toHaveBeenCalled()
    }
    const {app, profiles, humanSocial} = setup()
    profiles.getCurrentAccount.mockResolvedValue({...await profiles.getCurrentAccount(), kind: 'ip'})
    expect((await app.request(`${path}/follow`, body('PUT'))).status).toBe(403)
    expect(humanSocial.follow).not.toHaveBeenCalled()
  })
  it('rejects strict input and path violations before accessing the social port', async () => {
    const {app, humanSocial} = setup()
    for (const query of ['extra=true', 'x=1&x=2']) expect((await app.request(path + '?' + query)).status).toBe(400)
    expect((await app.request('/v1/humans/not-a-uuid')).status).toBe(400)
    for (const value of [{}, {visibility: 'everyone'}, {showPresence: 'true'}, {visibility: 'public', profileId}]) expect((await app.request('/v1/human-preferences', body('PATCH', value))).status).toBe(400)
    for (const method of ['PUT', 'DELETE']) for (const relation of ['follow', 'block']) {
      expect((await app.request(`${path}/${relation}`, body(method, {actor: viewerId}))).status).toBe(400)
      expect((await app.request(`${path}/${relation}?override=1`, body(method))).status).toBe(400)
    }
    expect((await app.request('/v1/human-preferences', {method: 'PATCH', body: '{"showPresence":true,"showPresence":false}'})).status).toBe(400)
    for (const port of Object.values(humanSocial)) expect(port).not.toHaveBeenCalled()
  })
  it.each([['PDM01', 403, 'HUMAN_SOCIAL_BLOCKED'], ['P0002', 404, 'HUMAN_PROFILE_NOT_FOUND'], ['42501', 404, 'HUMAN_PROFILE_NOT_FOUND'], ['22023', 422, 'HUMAN_SOCIAL_INVALID_OPERATION']] as const)('maps %s safely', async (code, status, name) => {
    const {app, humanSocial} = setup()
    humanSocial.follow.mockRejectedValue({code, message: 'secret db details'})
    const response = await app.request(`${path}/follow`, body('PUT'))
    expect(response.status).toBe(status); expect(await response.json()).toMatchObject({code: name}); expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('validates blocked/private relationships and hides unavailable profiles', async () => {
    const {app, humanSocial} = setup()
    humanSocial.getPublicProfile.mockResolvedValue({...profile, relationship: {...profile.relationship, blockedByViewer: true, messageDisabledReason: 'blocked'}})
    expect((await app.request(path)).status).toBe(200)
    humanSocial.getPublicProfile.mockResolvedValue({...profile, tabs: {...profile.tabs, saved: {state: 'available'}}})
    expect((await app.request(path)).status).toBe(500)
    humanSocial.getPublicProfile.mockResolvedValue(null as never)
    expect((await app.request(path)).status).toBe(404)
  })
  it('fails closed when not configured and preserves private early errors', async () => {
    expect((await createApp().request(path)).status).toBe(503)
    const {app, humanSocial} = setup({auth: undefined})
    expect((await app.request(path, {headers: {authorization: 'Bearer bad'}})).status).toBe(503); expect(humanSocial.getPublicProfile).not.toHaveBeenCalled()
    for (const target of ['/v1/humans', '/v1/human-preferences', `${path}/block`]) {
      const response = await createApp().request(target, body('PUT', {text: 'x'.repeat(70000)}))
      expect(response.status).toBe(413); expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
  })
})
