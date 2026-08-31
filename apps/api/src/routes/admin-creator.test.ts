import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {describe, expect, it, vi} from 'vitest'
import type {CreatorRequest, CreatorSubmissionRecord} from '@aifans/contracts'
import type {PlatformCreatorPort} from '../ports/creator.js'
import {requestIdMiddleware, type ApiVariables} from '../middleware/request-id.js'
import {registerAdminCreatorRoutes} from './admin-creator.js'

const operatorSubject = 'operator-subject'
const submissionId = randomUUID()
const requestId = randomUUID()
const now = '2026-09-01T00:00:00.000Z'
const references = ['avatar', 'cover', 'portrait', 'full_body', 'supporting_1'].map((role) => ({id: randomUUID(), role: role as 'avatar'}))
const revision = {
  id: randomUUID(), version: 1, username: 'luna_ai', displayName: 'Luna', shortDescription: 'A quiet observer.',
  languageCodes: ['en' as const], contentThemes: ['daily life'], visualType: 'anime' as const, appearance: 'Silver hair.', references, createdAt: now,
  persona: {personality: 'Warm', background: 'A long background', world: 'A near future city', values: 'Kindness', tone: 'Gentle', interests: ['music'], boundaries: 'No harmful requests', relationshipStyle: 'Supportive'},
}
const submission: CreatorSubmissionRecord = {id: submissionId, draftId: randomUUID(), revision, state: 'approved', ipProfileId: randomUUID(), submittedAt: now, decidedAt: now, decisionReason: null}
const creatorRequest: CreatorRequest = {id: requestId, ipProfileId: randomUUID(), kind: 'unpublish', reason: 'Identity conflicts with policy.', state: 'rejected', proposedRevision: null, createdAt: now, decidedAt: now, decisionReason: 'Identity conflicts with policy.'}

function dependencies(overrides: Record<string, unknown> = {}) {
  const platformCreator: PlatformCreatorPort = {
    setQuota: vi.fn(), getSubmission: vi.fn(async () => null), getRequest: vi.fn(async () => null),
    listSubmissions: vi.fn(async () => ({items: [], nextCursor: null})), decideSubmission: vi.fn(),
    listRequests: vi.fn(async () => ({items: [], nextCursor: null})), decideRequest: vi.fn(),
  }
  return {
    auth: {verify: vi.fn(async () => ({status: 'authenticated' as const, identity: {subject: operatorSubject}}))},
    profiles: {ensureHumanProfile: vi.fn(async () => ({})), getCurrentAccount: vi.fn(async () => ({id: randomUUID(), kind: 'human' as const, username: 'operator', displayName: 'Operator', preferredLocale: 'en' as const, creatorModeEnabled: false}))},
    authority: {isCurrentActorOperator: vi.fn(async () => true)}, platformCreator, ...overrides,
  }
}

function app(deps = dependencies()) {
  const instance = new Hono<{Variables: ApiVariables}>()
  instance.use('*', requestIdMiddleware)
  registerAdminCreatorRoutes(instance, deps)
  return {instance, deps}
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(await response.json()).toMatchObject({code, requestId: expect.any(String)})
}

describe('operator creator review routes', () => {
  it('requires an active operator before exposing pending queues', async () => {
    const {instance, deps} = app(dependencies({authority: {isCurrentActorOperator: vi.fn(async () => false)}}))
    await expectError(await instance.request('/v1/admin/creator/submissions'), 403, 'OPERATOR_REQUIRED')
    expect(deps.platformCreator.listSubmissions).not.toHaveBeenCalled()
  })

  it('strictly parses pending list/detail paths and queries', async () => {
    const {instance, deps} = app()
    expect((await instance.request('/v1/admin/creator/submissions?limit=25')).status).toBe(200)
    expect(deps.platformCreator.listSubmissions).toHaveBeenCalledWith({subject: operatorSubject}, {limit: 25})
    await expectError(await instance.request('/v1/admin/creator/submissions?limit=10&limit=20'), 400, 'INVALID_REQUEST')
    await expectError(await instance.request('/v1/admin/creator/submissions/not-a-uuid'), 400, 'INVALID_REQUEST')
    await expectError(await instance.request(`/v1/admin/creator/submissions/${submissionId}`), 404, 'CREATOR_SUBMISSION_NOT_FOUND')
  })

  it('derives the operator and correlation ID while approving/rejecting immutable reviews', async () => {
    const {instance, deps} = app()
    vi.mocked(deps.platformCreator.decideSubmission).mockResolvedValue(submission)
    const approved = await instance.request(`/v1/admin/creator/submissions/${submissionId}/decision`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({decision: 'approve'}),
    })
    expect(approved.status).toBe(200)
    expect(deps.platformCreator.decideSubmission).toHaveBeenCalledWith({actor: {subject: operatorSubject}, submissionId, decision: 'approve', requestId: approved.headers.get('x-request-id')})

    vi.mocked(deps.platformCreator.decideRequest).mockResolvedValue(creatorRequest)
    const rejected = await instance.request(`/v1/admin/creator/requests/${requestId}/decision`, {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({decision: 'reject', reason: 'Identity conflicts with policy.'}),
    })
    expect(rejected.status).toBe(200)
    expect(deps.platformCreator.decideRequest).toHaveBeenCalledWith({actor: {subject: operatorSubject}, requestId, decision: 'reject', reason: 'Identity conflicts with policy.', correlationId: expect.any(String)})
  })

  it('rejects forged identity fields, duplicate JSON keys, and conflicting decisions', async () => {
    const {instance, deps} = app()
    await expectError(await instance.request(`/v1/admin/creator/submissions/${submissionId}/decision`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({decision: 'approve', operatorId: randomUUID()})}), 422, 'INVALID_REQUEST')
    await expectError(await instance.request(`/v1/admin/creator/submissions/${submissionId}/decision`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{"decision":"approve","decision":"reject"}'}), 422, 'INVALID_REQUEST')
    vi.mocked(deps.platformCreator.decideSubmission).mockRejectedValue(new Error('conflicting creator submission decision'))
    await expectError(await instance.request(`/v1/admin/creator/submissions/${submissionId}/decision`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({decision: 'approve'})}), 409, 'CREATOR_CONFLICT')
  })

  it('propagates request IDs in successful review responses', async () => {
    const {instance, deps} = app()
    vi.mocked(deps.platformCreator.listRequests).mockResolvedValue({items: [], nextCursor: null})
    const response = await instance.request('/v1/admin/creator/requests')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(await response.json()).toEqual({items: [], nextCursor: null})
  })
})
