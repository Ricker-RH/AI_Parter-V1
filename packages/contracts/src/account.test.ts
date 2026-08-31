import {describe, expect, it} from 'vitest'
import {AccountSchema, AppSettingsSchema} from './index.js'

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
})
