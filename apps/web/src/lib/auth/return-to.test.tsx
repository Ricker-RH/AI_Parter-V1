import {describe, expect, it} from 'vitest'
import {readAdminReturnTo} from './return-to.js'

describe('admin auth return target', () => {
  it.each([
    ['zh-CN', '/zh-CN/admin'],
    ['zh-CN', '/zh-CN/admin/creator'],
    ['en', '/en/admin'],
    ['en', '/en/admin/creator'],
  ] as const)('accepts %s target %s', (locale, target) => {
    expect(readAdminReturnTo(locale, target)).toBe(target)
  })

  it.each([
    ['zh-CN', 'https://attacker.example/admin'],
    ['zh-CN', '//attacker.example/admin'],
    ['zh-CN', '/en/admin'],
    ['zh-CN', '/zh-CN/admin/users'],
    ['zh-CN', ['/zh-CN/admin']],
  ] as const)('rejects unsafe or unsupported target %#', (locale, target) => {
    expect(readAdminReturnTo(locale, target)).toBeUndefined()
  })
})
