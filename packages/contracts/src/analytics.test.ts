import {randomUUID} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {AnalyticsDeliveryIdentitySchema, createAnalyticsDeliveryIdentity} from './analytics.js'

describe('analytics delivery identity contract', () => {
  it('uses the authoritative profile UUID for a human actor', () => {
    const profileId = randomUUID()
    expect(createAnalyticsDeliveryIdentity('human', profileId)).toEqual({actorKind: 'human', actorProfileId: profileId, distinctId: profileId})
  })

  it('uses stable non-PII namespaces for IP and system actors', () => {
    const profileId = randomUUID()
    expect(createAnalyticsDeliveryIdentity('ip', profileId)).toEqual({actorKind: 'ip', actorProfileId: profileId, distinctId: `aifans:ip:${profileId}`})
    expect(createAnalyticsDeliveryIdentity(null, null)).toEqual({actorKind: 'system', actorProfileId: null, distinctId: 'aifans:system'})
  })

  it('rejects mismatched, missing, and event-scoped identities', () => {
    const profileId = randomUUID()
    expect(() => createAnalyticsDeliveryIdentity('human', null)).toThrow()
    expect(() => AnalyticsDeliveryIdentitySchema.parse({actorKind: 'human', actorProfileId: profileId, distinctId: randomUUID()})).toThrow()
    expect(() => AnalyticsDeliveryIdentitySchema.parse({actorKind: 'system', actorProfileId: null, distinctId: randomUUID()})).toThrow()
  })
})
