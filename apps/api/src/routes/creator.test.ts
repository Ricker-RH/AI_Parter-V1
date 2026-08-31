import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {describe, expect, it, vi} from 'vitest'
import type {CreatorDraft, CreatorDraftInput} from '@aifans/contracts'
import {requestIdMiddleware, type ApiVariables} from '../middleware/request-id.js'
import type {AssetPort} from '../ports/assets.js'
import type {CreatorPort} from '../ports/creator.js'
import {registerCreatorRoutes} from './creator.js'

const actorSubject = 'neon-human-1'
const profileId = randomUUID()
const draftId = randomUUID()
const assetId = randomUUID()
const now = '2026-09-01T00:00:00.000Z'

const input: CreatorDraftInput = {
  username: 'luna_ai', displayName: 'Luna', shortDescription: 'A quiet observer.',
  languageCodes: ['en'], contentThemes: ['daily life'], visualType: 'anime', appearance: 'Silver hair.',
  persona: {personality: 'Warm', background: 'A long background', world: 'A near future city', values: 'Kindness', tone: 'Gentle', interests: ['music'], boundaries: 'No harmful requests', relationshipStyle: 'Supportive'},
}
const draft: CreatorDraft = {...input, id: draftId, status: 'draft', references: [], createdAt: now, updatedAt: now}

function dependencies(overrides: Record<string, unknown> = {}) {
  const creator: CreatorPort = {
    createDraft: vi.fn(async () => draft), updateDraft: vi.fn(async () => draft), deleteDraft: vi.fn(async () => ({deleted: true})),
    getDraft: vi.fn(async () => draft), listDrafts: vi.fn(async () => ({items: [draft], nextCursor: null})),
    getIp: vi.fn(async () => null), listIps: vi.fn(async () => ({items: [], nextCursor: null})),
    registerReference: vi.fn(async () => ({created: true})), submitDraft: vi.fn(), getSubmission: vi.fn(async () => null),
    listSubmissions: vi.fn(async () => ({items: [], nextCursor: null})), createRequest: vi.fn(), listRequests: vi.fn(async () => ({items: [], nextCursor: null})),
    getAnalytics: vi.fn(async () => null),
  }
  const assets: AssetPort = {
    createUploadIntent: vi.fn(async () => ({assetId, method: 'PUT', url: 'https://signed.example/upload', headers: {'content-type': 'image/png'}, expiresAt: now, maxBytes: 10_485_760})),
    inspectUpload: vi.fn(async () => ({assetId, contentType: 'image/png', sizeBytes: 1234})),
    createReadIntent: vi.fn(async () => ({method: 'GET', url: 'https://signed.example/read', expiresAt: now})),
  }
  return {
    auth: {verify: vi.fn(async () => ({status: 'authenticated' as const, identity: {subject: actorSubject, email: 'human@example.com'}}))},
    profiles: {
      ensureHumanProfile: vi.fn(async () => ({})),
      getCurrentAccount: vi.fn(async () => ({id: profileId, kind: 'human' as const, username: 'human_one', displayName: 'Human', preferredLocale: 'en' as const, creatorModeEnabled: true})),
    },
    creator, assets, ...overrides,
  }
}

function app(deps = dependencies()) {
  const instance = new Hono<{Variables: ApiVariables}>()
  instance.use('*', requestIdMiddleware)
  registerCreatorRoutes(instance, deps)
  return {instance, deps}
}

async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(await response.json()).toMatchObject({code, requestId: expect.any(String)})
  expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
}

describe('creator routes', () => {
  it('requires a verified human and never accepts an actor/profile from the body', async () => {
    const missing = app(dependencies({auth: {verify: vi.fn(async () => ({status: 'missing' as const}))}}))
    await error(await missing.instance.request('/v1/creator/drafts'), 401, 'AUTH_REQUIRED')

    const {instance, deps} = app()
    await error(await instance.request('/v1/creator/drafts', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...input, creatorProfileId: randomUUID()}),
    }), 422, 'INVALID_REQUEST')
    expect(deps.creator.createDraft).not.toHaveBeenCalled()
  })

  it('creates, lists, reads, updates, and deletes only through the actor-derived creator port', async () => {
    const {instance, deps} = app()
    expect((await instance.request('/v1/creator/drafts', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input)})).status).toBe(201)
    expect((await instance.request('/v1/creator/drafts?limit=20')).status).toBe(200)
    expect((await instance.request(`/v1/creator/drafts/${draftId}`)).status).toBe(200)
    expect((await instance.request(`/v1/creator/drafts/${draftId}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify(input)})).status).toBe(200)
    expect((await instance.request(`/v1/creator/drafts/${draftId}`, {method: 'DELETE'})).status).toBe(204)
    expect(deps.creator.createDraft).toHaveBeenCalledWith({subject: actorSubject}, input)
    expect(deps.creator.updateDraft).toHaveBeenCalledWith({subject: actorSubject}, draftId, input)
  })

  it('rejects duplicate/unknown query and duplicate JSON keys before calling dependencies', async () => {
    const {instance, deps} = app()
    await error(await instance.request('/v1/creator/drafts?limit=10&limit=20'), 400, 'INVALID_REQUEST')
    await error(await instance.request('/v1/creator/drafts?actor=forged'), 400, 'INVALID_REQUEST')
    await error(await instance.request('/v1/creator/drafts', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: `{"username":"luna_ai","username":"forged"}`,
    }), 422, 'INVALID_REQUEST')
    await error(await instance.request('/v1/creator/drafts', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input).replace('"personality":"Warm"', '"personality":"Warm","personality":"Forged"'),
    }), 422, 'INVALID_REQUEST')
    expect(deps.creator.listDrafts).not.toHaveBeenCalled()
    expect(deps.creator.createDraft).not.toHaveBeenCalled()
  })

  it('issues bounded private upload intents without accepting or returning object keys', async () => {
    const {instance, deps} = app()
    const response = await instance.request(`/v1/creator/drafts/${draftId}/references/upload-intent`, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({contentType: 'image/png', sizeBytes: 4096}),
    })
    expect(response.status).toBe(201)
    const body = await response.json() as Record<string, unknown>
    expect(body).toEqual({assetId, method: 'PUT', url: 'https://signed.example/upload', headers: {'content-type': 'image/png'}, expiresAt: now, maxBytes: 10_485_760})
    expect(JSON.stringify(body)).not.toContain('objectKey')
    expect(deps.assets.createUploadIntent).toHaveBeenCalledWith({creatorProfileId: profileId, draftId, contentType: 'image/png', sizeBytes: 4096})
  })

  it('registers only an inspected upload and enforces the eight-reference boundary before signing', async () => {
    const {instance, deps} = app()
    const response = await instance.request(`/v1/creator/drafts/${draftId}/references`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId, contentType: 'image/png', width: 1024, height: 1024}),
    })
    expect(response.status).toBe(201)
    expect(deps.assets.inspectUpload).toHaveBeenCalledWith({creatorProfileId: profileId, draftId, assetId, contentType: 'image/png'})
    expect(deps.creator.registerReference).toHaveBeenCalledWith({subject: actorSubject}, draftId, {id: assetId, contentType: 'image/png', width: 1024, height: 1024})

    vi.mocked(deps.creator.getDraft).mockResolvedValue({...draft, references: Array.from({length: 8}, (_, index) => ({id: randomUUID(), role: ['avatar', 'cover', 'portrait', 'full_body', 'supporting_1', 'supporting_2', 'supporting_3', 'supporting_4'][index] as never}))})
    await error(await instance.request(`/v1/creator/drafts/${draftId}/references/upload-intent`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({contentType: 'image/png', sizeBytes: 100})}), 409, 'REFERENCE_LIMIT_REACHED')
    expect(deps.assets.createUploadIntent).toHaveBeenCalledTimes(0)
  })

  it('creates a private read intent from owned asset metadata without trusting a MIME query', async () => {
    const {instance, deps} = app()
    vi.mocked(deps.creator.getDraft).mockResolvedValue({...draft, references: [{id: assetId, role: 'avatar'}]})
    const response = await instance.request(`/v1/creator/drafts/${draftId}/references/${assetId}/read-intent`)
    expect(response.status).toBe(200)
    expect(deps.assets.createReadIntent).toHaveBeenCalledWith({creatorProfileId: profileId, draftId, assetId})
    await error(await instance.request(`/v1/creator/drafts/${draftId}/references/${assetId}/read-intent?contentType=image/png`), 400, 'INVALID_REQUEST')
  })

  it('returns safe storage and generation not-configured responses', async () => {
    const withoutAssets = app(dependencies({assets: undefined}))
    await error(await withoutAssets.instance.request(`/v1/creator/drafts/${draftId}/references/upload-intent`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({contentType: 'image/png', sizeBytes: 100})}), 503, 'ASSETS_NOT_CONFIGURED')
    await error(await withoutAssets.instance.request(`/v1/creator/drafts/${draftId}/generation-intent`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'}), 503, 'IMAGE_GENERATION_NOT_CONFIGURED')
  })

  it('submits selected references and creates later requests with path-derived IDs and request IDs', async () => {
    const {instance, deps} = app()
    const references = ['avatar', 'cover', 'portrait', 'full_body', 'supporting_1'].map((role) => ({assetId: randomUUID(), role}))
    vi.mocked(deps.creator.submitDraft).mockResolvedValue({id: randomUUID(), draftId, revision: {...input, id: randomUUID(), version: 1, references: references.map(({assetId, role}) => ({id: assetId, role: role as never})), createdAt: now}, state: 'pending_review', ipProfileId: null, submittedAt: now, decidedAt: null, decisionReason: null})
    const submit = await instance.request(`/v1/creator/drafts/${draftId}/submit`, {method: 'POST', headers: {'content-type': 'application/json', 'x-request-id': randomUUID()}, body: JSON.stringify({authorizationVersion: '2026-09-01', references})})
    expect(submit.status).toBe(201)
    expect(deps.creator.submitDraft).toHaveBeenCalledWith({subject: actorSubject}, {draftId, authorizationVersion: '2026-09-01', references}, {requestId: expect.any(String)})

    const ipProfileId = randomUUID()
    vi.mocked(deps.creator.createRequest).mockResolvedValue({id: randomUUID(), ipProfileId, kind: 'unpublish', reason: 'Please unpublish this identity.', state: 'pending', proposedRevision: null, createdAt: now, decidedAt: null, decisionReason: null})
    const request = await instance.request(`/v1/creator/ips/${ipProfileId}/requests`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({kind: 'unpublish', reason: 'Please unpublish this identity.'})})
    expect(request.status).toBe(201)
    expect(deps.creator.createRequest).toHaveBeenCalledWith({subject: actorSubject}, {ipProfileId, kind: 'unpublish', reason: 'Please unpublish this identity.'}, {requestId: expect.any(String)})
  })

  it('maps ownership/not-found, quota/conflict, and invalid persistence failures safely', async () => {
    const notFound = app()
    vi.mocked(notFound.deps.creator.getDraft).mockResolvedValue(null)
    await error(await notFound.instance.request(`/v1/creator/drafts/${draftId}`), 404, 'CREATOR_DRAFT_NOT_FOUND')

    const conflict = app()
    vi.mocked(conflict.deps.creator.createDraft).mockRejectedValue(new Error('creator quota exceeded'))
    await error(await conflict.instance.request('/v1/creator/drafts', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input)}), 409, 'CREATOR_CONFLICT')
  })
})
