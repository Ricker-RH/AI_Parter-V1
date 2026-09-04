import {describe, expect, it} from 'vitest'
import {
  AccountSchema,
  AppSettingsSchema,
  ProfileAssetConfirmationRequestSchema,
  ProfileAssetConfirmationResponseSchema,
  ProfileAssetIntentRequestSchema,
  ProfileAssetIntentSchema,
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
})
