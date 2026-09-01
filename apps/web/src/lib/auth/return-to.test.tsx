import {describe, expect, it} from 'vitest'
import {readAdminReturnTo, readUserReturnTo} from './return-to.js'

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

describe('user auth return target', () => {
  it.each([
    ['en', '/en/messages'],
    ['en', '/en?feed=following&visualType=anime'],
    ['zh-CN', '/zh-CN/bookmarks'],
    ['zh-CN', '/zh-CN/posts/123'],
  ] as const)('accepts the same-locale protected target %s', (locale, target) => {
    expect(readUserReturnTo(locale, target)).toBe(target)
  })

  it.each([
    ['en', 'https://attacker.example'],
    ['en', '//attacker.example'],
    ['en', '/zh-CN/messages'],
    ['en', ['/en/messages']],
    ['en', '/en'],
    ['en', '/en?feed=for_you'],
    ['en', '/en/admin'],
    ['en', '/en/not-allowed'],
    ['en', '/en/messages#fragment'],
  ] as const)('rejects unsafe, malformed, or unsupported user target %#', (locale, target) => {
    expect(readUserReturnTo(locale, target)).toBeUndefined()
  })
})
