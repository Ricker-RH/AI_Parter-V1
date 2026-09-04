import {describe, expect, it} from 'vitest'
import {
  AccountSchema,
  AppSettingsSchema,
  ProfileAssetConfirmationRequestSchema,
  ProfileAssetConfirmationResponseSchema,
  ProfileAssetIntentRequestSchema,
  ProfileAssetIntentSchema,
  ProfileBackgroundInputSchema,
  ProfileBackgroundSchema,
  UpdateCurrentAccountSchema,
} from './index.js'

const account = {
  id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
  kind: 'human' as const,
  username: 'rui',
  displayName: 'Rui',
  preferredLocale: 'zh-CN' as const,
  creatorModeEnabled: false,
}

describe('AIFANS contracts', () => {
  it('accepts a human account without publishing capability', () => {
    const parsed = AccountSchema.parse(account)
    expect(parsed).toMatchObject({
      kind: 'human',
      profileVersion: 1,
      background: {type: 'color', colorKey: 'paper'},
    })
  })

  it('requires an explicit IP approval switch', () => {
    expect(AppSettingsSchema.parse({creatorIpRequiresApproval: false, defaultIpQuota: 3}))
      .toEqual({creatorIpRequiresApproval: false, defaultIpQuota: 3})
  })

  it('accepts a nullable bio on the safe account projection', () => {
    const parsed = AccountSchema.parse({...account, bio: null, preferredLocale: 'en'})
    expect(parsed.bio).toBeNull()
  })

  it('strictly validates only editable current-account fields', () => {
    expect(UpdateCurrentAccountSchema.parse({
      profileVersion: 3, username: 'rui_2', displayName: ' Rui ', bio: null, preferredLocale: 'zh-CN',
    })).toEqual({profileVersion: 3, username: 'rui_2', displayName: 'Rui', bio: null, preferredLocale: 'zh-CN'})
    expect(UpdateCurrentAccountSchema.safeParse({profileVersion: 3, creatorModeEnabled: true}).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({profileVersion: 3, username: 'Bad Name'}).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({profileVersion: 3}).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({}).success).toBe(false)
  })

  it.each([
    ['username', {profileVersion: 3, username: undefined}],
    ['avatar asset', {profileVersion: 3, avatarAssetId: undefined}],
    ['background', {profileVersion: 3, background: undefined}],
  ])('rejects an undefined %s edit', (_label, input) => {
    expect(UpdateCurrentAccountSchema.safeParse(input).success).toBe(false)
  })

  it('counts a nullable profile field as an actual edit', () => {
    expect(UpdateCurrentAccountSchema.safeParse({profileVersion: 3, avatarAssetId: null}).success)
      .toBe(true)
  })

  it('accepts public color and image profile backgrounds', () => {
    expect(AccountSchema.parse({
      ...account,
      profileVersion: 3,
      background: {type: 'color', colorKey: 'paper'},
    }).background).toEqual({type: 'color', colorKey: 'paper'})

    expect(AccountSchema.parse({
      ...account,
      profileVersion: 4,
      background: {
        type: 'image',
        url: 'https://cdn.example.com/profile/background.webp',
        focalX: 0.25,
        focalY: 0.75,
      },
    }).background).toEqual({
      type: 'image',
      url: 'https://cdn.example.com/profile/background.webp',
      focalX: 0.25,
      focalY: 0.75,
    })
  })

  it('requires a profile version and keeps public URLs out of profile edits', () => {
    const backgroundAssetId = '361967d8-e74f-4f6a-a6b7-ff29656de9f4'
    expect(UpdateCurrentAccountSchema.safeParse({displayName: 'Rui 2'}).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({
      profileVersion: 3,
      avatarAssetId: backgroundAssetId,
      background: {type: 'image', backgroundAssetId, focalX: 0, focalY: 1},
    }).success).toBe(true)
    expect(UpdateCurrentAccountSchema.safeParse({
      profileVersion: 3,
      background: {type: 'color', colorKey: '#fff'},
    }).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({
      profileVersion: 3,
      avatarUrl: 'https://evil.example/avatar.png',
    }).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({
      profileVersion: 3,
      background: {type: 'image', url: 'https://evil.example/background.png', focalX: 0.5, focalY: 0.5},
    }).success).toBe(false)
  })

  it('accepts strict profile upload intent and confirmation contracts without exposing object keys', () => {
    expect(ProfileAssetIntentRequestSchema.parse({
      role: 'avatar',
      contentType: 'image/webp',
      sizeBytes: 1200,
      width: 512,
      height: 512,
    }).role).toBe('avatar')

    expect(ProfileAssetIntentSchema.parse({
      assetId: '361967d8-e74f-4f6a-a6b7-ff29656de9f4',
      method: 'PUT',
      url: 'https://uploads.example.com/profile',
      headers: {'content-type': 'image/webp'},
      expiresAt: '2026-09-04T12:00:00.000Z',
      maxBytes: 10_485_760,
    }).method).toBe('PUT')

    const confirmation = {
      assetId: '361967d8-e74f-4f6a-a6b7-ff29656de9f4',
      role: 'avatar' as const,
    }
    expect(ProfileAssetConfirmationRequestSchema.parse({assetId: confirmation.assetId}))
      .toEqual({assetId: confirmation.assetId})
    expect(ProfileAssetConfirmationResponseSchema.parse(confirmation)).toEqual(confirmation)
    expect(ProfileAssetConfirmationResponseSchema.safeParse({...confirmation, objectKey: 'private/key'}).success)
      .toBe(false)
  })

  it('rejects malformed public and editable profile backgrounds', () => {
    const assetId = '361967d8-e74f-4f6a-a6b7-ff29656de9f4'
    const invalidCases: Array<[string, {safeParse: (value: unknown) => {success: boolean}}, unknown]> = [
      ['public extra field', ProfileBackgroundSchema, {type: 'color', colorKey: 'paper', css: '#fff'}],
      ['public arbitrary color', ProfileBackgroundSchema, {type: 'color', colorKey: '#fff'}],
      ['public relative URL', ProfileBackgroundSchema, {type: 'image', url: '/image.webp', focalX: 0.5, focalY: 0.5}],
      ['public focalX below range', ProfileBackgroundSchema, {type: 'image', url: 'https://cdn.example/a', focalX: -0.01, focalY: 0.5}],
      ['public focalY above range', ProfileBackgroundSchema, {type: 'image', url: 'https://cdn.example/a', focalX: 0.5, focalY: 1.01}],
      ['editable extra field', ProfileBackgroundInputSchema, {type: 'color', colorKey: 'paper', url: 'https://evil.example/a'}],
      ['editable malformed asset ID', ProfileBackgroundInputSchema, {type: 'image', backgroundAssetId: 'bad', focalX: 0.5, focalY: 0.5}],
      ['editable focalX above range', ProfileBackgroundInputSchema, {type: 'image', backgroundAssetId: assetId, focalX: 1.01, focalY: 0.5}],
      ['editable focalY below range', ProfileBackgroundInputSchema, {type: 'image', backgroundAssetId: assetId, focalX: 0.5, focalY: -0.01}],
    ]
    for (const [label, schema, input] of invalidCases) {
      expect(schema.safeParse(input).success, label).toBe(false)
    }
  })

  it('rejects malformed profile asset intent requests', () => {
    const valid = {
      role: 'avatar',
      contentType: 'image/webp',
      sizeBytes: 1200,
      width: 512,
      height: 512,
    }
    const invalidCases: Array<[string, unknown]> = [
      ['extra field', {...valid, objectKey: 'public/profiles/key'}],
      ['unsupported role', {...valid, role: 'post'}],
      ['unsupported content type', {...valid, contentType: 'image/gif'}],
      ['size below minimum', {...valid, sizeBytes: 0}],
      ['size above maximum', {...valid, sizeBytes: 10_485_761}],
      ['fractional size', {...valid, sizeBytes: 1.5}],
      ['width below minimum', {...valid, width: 63}],
      ['width above maximum', {...valid, width: 12_001}],
      ['fractional width', {...valid, width: 512.5}],
      ['height below minimum', {...valid, height: 63}],
      ['height above maximum', {...valid, height: 12_001}],
      ['fractional height', {...valid, height: 512.5}],
    ]
    for (const [label, input] of invalidCases) {
      expect(ProfileAssetIntentRequestSchema.safeParse(input).success, label).toBe(false)
    }
  })

  it('rejects malformed profile asset intents and confirmations', () => {
    const assetId = '361967d8-e74f-4f6a-a6b7-ff29656de9f4'
    const intent = {
      assetId,
      method: 'PUT',
      url: 'https://uploads.example.com/profile',
      headers: {'content-type': 'image/webp'},
      expiresAt: '2026-09-04T12:00:00.000Z',
      maxBytes: 10_485_760,
    }
    const invalidIntents: Array<[string, unknown]> = [
      ['extra field', {...intent, objectKey: 'public/profiles/key'}],
      ['malformed UUID', {...intent, assetId: 'bad'}],
      ['unsupported method', {...intent, method: 'POST'}],
      ['relative URL', {...intent, url: '/upload'}],
      ['non-string header value', {...intent, headers: {'content-length': 1200}}],
      ['malformed datetime', {...intent, expiresAt: 'tomorrow'}],
      ['fractional max bytes', {...intent, maxBytes: 1200.5}],
    ]
    for (const [label, input] of invalidIntents) {
      expect(ProfileAssetIntentSchema.safeParse(input).success, label).toBe(false)
    }

    const invalidConfirmations: Array<[
      string,
      {safeParse: (value: unknown) => {success: boolean}},
      unknown,
    ]> = [
      ['request extra field', ProfileAssetConfirmationRequestSchema, {assetId, objectKey: 'private/key'}],
      ['request malformed ID', ProfileAssetConfirmationRequestSchema, {assetId: 'bad'}],
      ['response extra field', ProfileAssetConfirmationResponseSchema, {assetId, role: 'avatar', objectKey: 'private/key'}],
      ['response malformed ID', ProfileAssetConfirmationResponseSchema, {assetId: 'bad', role: 'avatar'}],
      ['response unsupported role', ProfileAssetConfirmationResponseSchema, {assetId, role: 'post'}],
    ]
    for (const [label, schema, input] of invalidConfirmations) {
      expect(schema.safeParse(input).success, label).toBe(false)
    }
  })

  describe.each([
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:image/png;base64,AA=='],
    ['file', 'file:///tmp/avatar.png'],
    ['ftp', 'ftp://uploads.example.com/avatar.png'],
  ])('rejects %s URLs', (_scheme, url) => {
    it('for public profile images', () => {
      expect(ProfileBackgroundSchema.safeParse({
        type: 'image', url, focalX: 0.5, focalY: 0.5,
      }).success).toBe(false)
      expect(AccountSchema.safeParse({...account, avatarUrl: url}).success).toBe(false)
    })

    it('for signed profile asset intents', () => {
      expect(ProfileAssetIntentSchema.safeParse({
        assetId: '361967d8-e74f-4f6a-a6b7-ff29656de9f4',
        method: 'PUT',
        url,
        headers: {'content-type': 'image/webp'},
        expiresAt: '2026-09-04T12:00:00.000Z',
        maxBytes: 10_485_760,
      }).success).toBe(false)
    })
  })

  it.each([0, -1])('rejects a profile asset intent maxBytes of %s', (maxBytes) => {
    expect(ProfileAssetIntentSchema.safeParse({
      assetId: '361967d8-e74f-4f6a-a6b7-ff29656de9f4',
      method: 'PUT',
      url: 'https://uploads.example.com/profile',
      headers: {'content-type': 'image/webp'},
      expiresAt: '2026-09-04T12:00:00.000Z',
      maxBytes,
    }).success).toBe(false)
  })
})
