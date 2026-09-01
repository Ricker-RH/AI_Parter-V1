import {describe, expect, it} from 'vitest'
import {encodeSearchCursor} from '@aifans/contracts'
import {authHref, readAdminReturnTo, readUserReturnTo} from './return-to.js'

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
  it('accepts a contract-sized CJK query and its encoded cursor', () => {
    const query = '月'.repeat(80)
    const cursor = encodeSearchCursor({
      v: 1, kind: 'search', category: 'ips', query, resultType: 'profile',
      displayName: query, id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
    })
    const target = `/en/search?q=${encodeURIComponent(query)}&category=ips&cursor=${cursor}`
    expect(readUserReturnTo('en', target)).toBe(target)
  })
  it('builds an encoded login href only from a validated user target', () => {
    expect(authHref('en', '/en/messages')).toBe('/en/auth/sign-in?next=%2Fen%2Fmessages')
    expect(authHref('en', 'https://attacker.example')).toBe('/en/auth/sign-in?next=%2Fen')
  })
  it.each([
    ['en', '/en/messages'],
    ['en', '/en?feed=following'],
    ['zh-CN', '/zh-CN/bookmarks'],
    ['zh-CN', '/zh-CN/posts/123'],
    ['en', '/en/search?q=luna%20moon&category=posts&cursor=abc_DEF-123'],
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
    ['en', '/en?feed=following&visualType=anime'],
    ['en', '/en?visualType=anime'],
    ['en', '/en/admin'],
    ['en', '/en/not-allowed'],
    ['en', '/en/messages#fragment'],
    ['en', '/en/search?q=luna&sort=recent'],
    ['en', '/en/search?q=luna&category=users'],
    ['en', '/en/search?q='],
    ['en', '/en/search?q=luna&q=moon'],
    ['en', '/en/search?q=luna&cursor=bad.cursor'],
  ] as const)('rejects unsafe, malformed, or unsupported user target %#', (locale, target) => {
    expect(readUserReturnTo(locale, target)).toBeUndefined()
  })
})
