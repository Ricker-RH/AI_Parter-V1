import {describe, expect, it} from 'vitest'
import * as contracts from './index.js'

const identity = {kind: 'HUMAN', id: '123e4567-e89b-42d3-a456-426614174000', displayName: 'Alice', username: 'alice', avatarUrl: null}
const relationship = {following: false, followedBy: false, blockedByViewer: false, canMessage: true, messageDisabledReason: null}

describe('human social v1 contracts', () => {
  it('validates tab content without permitting locked data or counts',()=>{
    expect(contracts.HumanProfileTabPageSchema.parse({state:'locked'})).toEqual({state:'locked'})
    for(const tab of ['ips','liked','saved','following']) expect(contracts.HumanProfileTabPageSchema.parse({state:'ready',tab,items:[],nextCursor:null})).toMatchObject({tab})
    for(const value of [{state:'locked',items:[]},{state:'locked',nextCursor:null},{state:'locked',count:0},{state:'ready',tab:'wrong',items:[],nextCursor:null}]) expect(contracts.HumanProfileTabPageSchema.safeParse(value).success).toBe(false)
  })
  it('retains basic bio and shared profile background without unlocking private tabs', () => {
    const value = {v: 1, identity, bio: 'hello', background: {type: 'color', colorKey: 'sage'}, visibility: 'private', isOwner: false, relationship, tabs: {ips: {state: 'locked'}, liked: {state: 'locked'}, saved: {state: 'locked'}, following: {state: 'locked'}}}
    expect(contracts.HumanProfileSchema.parse(value)).toMatchObject({bio: 'hello', background: {type: 'color', colorKey: 'sage'}})
  })
  it('exports canonical human identity validation', () => {
    expect(contracts).toHaveProperty('HumanIdentitySchema')
    expect(contracts.HumanIdentitySchema.parse(identity)).toEqual(identity)
  })
  it('rejects nonhuman identities, invalid ids and unknown identity fields', () => {
    for (const value of [{...identity, kind: 'AI'}, {...identity, id: 'bad'}, {...identity, ownerId: identity.id}, {...identity, displayName: 'a'.repeat(81)}]) {
      expect(contracts.HumanIdentitySchema.safeParse(value).success).toBe(false)
    }
  })
  it('represents locked tabs without leaking private payloads', () => {
    const profile = {v: 1, identity, visibility: 'private', isOwner: false, relationship, tabs: {ips: {state: 'locked'}, liked: {state: 'locked'}, saved: {state: 'locked'}, following: {state: 'locked'}}}
    expect(contracts.HumanProfileSchema.safeParse(profile).success).toBe(true)
    expect(contracts.HumanProfileSchema.safeParse({...profile, tabs: {...profile.tabs, ips: {state: 'locked', items: [{body: 'secret'}]}}}).success).toBe(false)
    expect(contracts.HumanProfileSchema.safeParse({...profile, tabs: {...profile.tabs, ips: {state: 'available'}}}).success).toBe(false)
  })
  it('requires a reason when messaging is unavailable and disallows blocked messaging', () => {
    expect(contracts.HumanRelationshipSchema.safeParse(relationship).success).toBe(true)
    expect(contracts.HumanRelationshipSchema.safeParse({...relationship, canMessage: false}).success).toBe(false)
    expect(contracts.HumanRelationshipSchema.safeParse({...relationship, blockedByViewer: true}).success).toBe(false)
    expect(contracts.HumanRelationshipSchema.safeParse({...relationship, canMessage: false, messageDisabledReason: 'mutual_follow_required'}).success).toBe(true)
  })
  it('only accepts credential-free https avatars', () => {
    expect(contracts.HumanIdentitySchema.safeParse({...identity, avatarUrl: 'https://cdn.example.test/avatar.png'}).success).toBe(true)
    for (const avatarUrl of ['http://example.test/avatar', 'javascript:alert(1)', 'https://user:pass@example.test/avatar']) expect(contracts.HumanIdentitySchema.safeParse({...identity, avatarUrl}).success).toBe(false)
  })
  it('requires all owner tabs to be available', () => {
    const profile = {v: 1, identity, visibility: 'private', isOwner: true, relationship, tabs: {ips: {state: 'available'}, liked: {state: 'available'}, saved: {state: 'available'}, following: {state: 'available'}}}
    expect(contracts.HumanProfileSchema.safeParse(profile).success).toBe(true)
    expect(contracts.HumanProfileSchema.safeParse({...profile, tabs: {...profile.tabs, saved: {state: 'locked'}}}).success).toBe(false)
  })
  it('allows only privacy and presence in preference updates', () => {
    expect(contracts).toHaveProperty('HumanPreferencesUpdateInputSchema')
    expect(contracts.HumanPreferencesUpdateInputSchema.safeParse({visibility: 'private', showPresence: false}).success).toBe(true)
    expect(contracts.HumanPreferencesUpdateInputSchema.safeParse({showPresence: false}).success).toBe(true)
    for (const value of [{}, {visibility: 'friends'}, {showPresence: 'yes'}, {visibility: 'public', profileId: identity.id}]) expect(contracts.HumanPreferencesUpdateInputSchema.safeParse(value).success).toBe(false)
  })
})
