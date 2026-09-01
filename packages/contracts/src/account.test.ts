import {describe, expect, it} from 'vitest'
import {AccountSchema, AppSettingsSchema, UpdateCurrentAccountSchema} from './index.js'

describe('AIFANS contracts', () => {
  it('accepts a human account without publishing capability', () => {
    const account = AccountSchema.parse({
      id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
      kind: 'human', username: 'rui', displayName: 'Rui',
      preferredLocale: 'zh-CN', creatorModeEnabled: false,
    })
    expect(account.kind).toBe('human')
  })

  it('requires an explicit IP approval switch', () => {
    expect(AppSettingsSchema.parse({creatorIpRequiresApproval: false, defaultIpQuota: 3}))
      .toEqual({creatorIpRequiresApproval: false, defaultIpQuota: 3})
  })

  it('accepts a nullable bio on the safe account projection', () => {
    const account = AccountSchema.parse({
      id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
      kind: 'human', username: 'rui', displayName: 'Rui', bio: null,
      preferredLocale: 'en', creatorModeEnabled: false,
    })
    expect(account.bio).toBeNull()
  })

  it('strictly validates only editable current-account fields', () => {
    expect(UpdateCurrentAccountSchema.parse({
      username: 'rui_2', displayName: ' Rui ', bio: null, preferredLocale: 'zh-CN',
    })).toEqual({username: 'rui_2', displayName: 'Rui', bio: null, preferredLocale: 'zh-CN'})
    expect(UpdateCurrentAccountSchema.safeParse({creatorModeEnabled: true}).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({username: 'Bad Name'}).success).toBe(false)
    expect(UpdateCurrentAccountSchema.safeParse({}).success).toBe(false)
  })
})
