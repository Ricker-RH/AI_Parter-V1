import {describe, expect, it} from 'vitest'
import {isNavigationActive} from './navigation-active.js'

describe('shared navigation active matcher', () => {
  it.each([
    ['forYou', '', '/en', false, true],
    ['forYou', '', '/en', true, false],
    ['following', '?feed=following', '/en', true, true],
    ['channels', '/channels', '/zh-CN/channels', undefined, true],
    ['channels', '/channels', '/zh-CN/channels/anime/profiles', undefined, true],
    ['messages', '/messages', '/en/messages/conversation-1', undefined, true],
    ['messages', '/messages', '/en/notifications', undefined, true],
    ['profile', '/profile', '/en/profiles/public-id', undefined, false],
  ] as const)('matches %s against %s consistently', (key, href, pathname, following, expected) => {
    expect(isNavigationActive({key, href}, pathname.startsWith('/zh-CN') ? 'zh-CN' : 'en', pathname, following)).toBe(expected)
  })
})
