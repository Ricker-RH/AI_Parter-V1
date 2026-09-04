import type {Locale} from '../../i18n/config'
import {decodeChatConversationCursor, decodeChatMessageCursor, decodeCursor, decodeLikedCursor, decodeNotificationCursor, encodeChatConversationCursor, encodeChatMessageCursor, encodeCursor, encodeLikedCursor, encodeNotificationCursor} from '@aifans/contracts'

export function authHref(locale: Locale, returnTo: string): string {
  const safeReturn = readUserReturnTo(locale, returnTo) ?? `/${locale}`
  return `/${locale}/auth/sign-in?next=${encodeURIComponent(safeReturn)}`
}

export function readCreatorReturnTo(locale: Locale, value: string | readonly string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const splitAt = value.indexOf('?')
  const pathname = splitAt === -1 ? value : value.slice(0, splitAt)
  const base = `/${locale}`
  if (pathname !== base && pathname !== `${base}/channels` && pathname !== `${base}/messages`) return undefined
  if (value === base || value === `${base}/channels`) return value
  return readUserReturnTo(locale, value)
}

export function creatorHref(locale: Locale, returnTo: string): string {
  const safeReturn = readCreatorReturnTo(locale, returnTo) ?? `/${locale}`
  return `/${locale}/creator?returnTo=${encodeURIComponent(safeReturn)}`
}

export function readAdminReturnTo(locale: Locale, value: string | readonly string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const allowed = new Set([`/${locale}/admin`, `/${locale}/admin/creator`])
  return allowed.has(value) ? value : undefined
}

function queryIsWellFormed(query: string): boolean {
  return !/%(?![0-9A-Fa-f]{2})/.test(query) && !/[\u0000-\u001F\u007F]/.test(query)
}

function hasOnlyQueryKeys(query: string, keys: readonly string[]): boolean {
  if (!query) return true
  if (!queryIsWellFormed(query)) return false
  const params = new URLSearchParams(query)
  return [...params].every(([key, value]) => keys.includes(key) && value.length > 0)
}

function isCanonicalCursor(cursor: string, kind: 'conversation' | 'message' | 'liked' | 'saved'): boolean {
  try {
    if (kind === 'conversation') return encodeChatConversationCursor(decodeChatConversationCursor(cursor)) === cursor
    if (kind === 'message') return encodeChatMessageCursor(decodeChatMessageCursor(cursor)) === cursor
    if (kind === 'liked') return encodeLikedCursor(decodeLikedCursor(cursor)) === cursor
    return encodeCursor(decodeCursor(cursor, 'following')) === cursor
  } catch { return false }
}

export function isCanonicalChatConversationCursor(value: string): boolean { return isCanonicalCursor(value, 'conversation') }
export function isCanonicalChatMessageCursor(value: string): boolean { return isCanonicalCursor(value, 'message') }
export function isCanonicalNotificationCursor(value: string): boolean {
  try { return encodeNotificationCursor(decodeNotificationCursor(value)) === value } catch { return false }
}

function hasCanonicalCursor(query: string, kind: 'conversation' | 'message' | 'liked'): boolean {
  if (!query) return true
  if (!queryIsWellFormed(query)) return false
  const params = new URLSearchParams(query)
  if ([...params.keys()].some((key) => key !== 'cursor') || params.getAll('cursor').length !== 1) return false
  const cursor = params.get('cursor')
  if (!cursor) return false
  return isCanonicalCursor(cursor, kind)
}

function hasCanonicalMessageDetailQuery(query: string): boolean {
  if (!query) return true
  if (!queryIsWellFormed(query)) return false
  const params = new URLSearchParams(query)
  if ([...params.keys()].some((key) => key !== 'cursor' && key !== 'listCursor') || params.getAll('cursor').length > 1 || params.getAll('listCursor').length > 1) return false
  const historyCursor = params.get('cursor')
  const listCursor = params.get('listCursor')
  return (historyCursor === null || (historyCursor.length > 0 && isCanonicalChatMessageCursor(historyCursor))) && (listCursor === null || (listCursor.length > 0 && isCanonicalChatConversationCursor(listCursor)))
}

function hasCanonicalActivityQuery(query: string): boolean {
  if (!query) return true
  if (!queryIsWellFormed(query)) return false
  const params = new URLSearchParams(query)
  if ([...params.keys()].some((key) => key !== 'tab' && key !== 'cursor') || params.getAll('tab').length > 1 || params.getAll('cursor').length > 1) return false
  const tab = params.get('tab') ?? 'liked'
  if (tab !== 'liked' && tab !== 'saved') return false
  const cursor = params.get('cursor')
  return cursor === null || (cursor.length > 0 && isCanonicalCursor(cursor, tab))
}

function hasSafeSearchQuery(query: string): boolean {
  if (!queryIsWellFormed(query)) return false
  const params = new URLSearchParams(query)
  const keys = [...params.keys()]
  if (keys.some((key) => !['q', 'category', 'cursor'].includes(key))) return false
  if (params.getAll('q').length !== 1) return false
  const q = params.get('q') ?? ''
  if (q.length < 1 || q.length > 80 || q.trim().replace(/\s+/g, ' ') !== q) return false
  if (params.getAll('category').length > 1 || (params.get('category') !== null && !['all', 'ips', 'posts'].includes(params.get('category')!))) return false
  if (params.getAll('cursor').length > 1 || (params.get('cursor') !== null && !/^[A-Za-z0-9_-]{1,2048}$/.test(params.get('cursor')!))) return false
  return true
}

export function readUserReturnTo(locale: Locale, value: string | readonly string[] | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.includes('#') || /[\\\u0000-\u001F\u007F]/.test(value)) return undefined
  const splitAt = value.indexOf('?')
  const pathname = splitAt === -1 ? value : value.slice(0, splitAt)
  const query = splitAt === -1 ? '' : value.slice(splitAt + 1)
  const base = `/${locale}`
  if (!pathname.startsWith(`${base}/`) && pathname !== base) return undefined
  if (pathname.includes('//') || pathname.includes('%')) return undefined

  if (pathname === base) {
    if (!queryIsWellFormed(query)) return undefined
    const params = new URLSearchParams(query)
    if ([...params.keys()].some((key) => key !== 'feed')) return undefined
    if (params.getAll('feed').length > 1 || (params.get('feed') !== null && params.get('feed') !== 'following')) return undefined
    return params.size > 0 ? value : undefined
  }

  if (pathname === `${base}/search`) return hasSafeSearchQuery(query) ? value : undefined

  if (pathname === `${base}/messages`) {
    if (queryIsWellFormed(query)) {
      const params = new URLSearchParams(query)
      if ([...params.keys()].length === 1 && params.getAll('humanConversation').length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.get('humanConversation')!)) return value
    }
    return hasCanonicalCursor(query, 'conversation') ? value : undefined
  }
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  if (pathname === `${base}/messages/notifications`) {
    if (!query) return value
    const params = new URLSearchParams(query)
    const cursor = params.get('cursor')
    return [...params.keys()].every((key) => key === 'cursor') && params.getAll('cursor').length === 1 && cursor && isCanonicalNotificationCursor(cursor) ? value : undefined
  }
  if (new RegExp(`^${base}/messages/notifications/${uuid}$`, 'i').test(pathname)) {
    if (!query) return value
    const params = new URLSearchParams(query)
    const cursor = params.get('listCursor')
    return [...params.keys()].every((key) => key === 'listCursor') && params.getAll('listCursor').length === 1 && cursor && isCanonicalNotificationCursor(cursor) ? value : undefined
  }
  if (new RegExp(`^${base}/messages/${uuid}$`, 'i').test(pathname)) return hasCanonicalMessageDetailQuery(query) ? value : undefined
  if (pathname === `${base}/liked`) return hasCanonicalCursor(query, 'liked') ? value : undefined
  if (pathname === `${base}/settings`) return hasOnlyQueryKeys(query, []) ? value : undefined
  if (pathname === `${base}/activity`) return hasCanonicalActivityQuery(query) ? value : undefined

  if (pathname === `${base}/creator`) {
    if (!query) return value
    const params = new URLSearchParams(query)
    const returnTo = params.get('returnTo')
    return [...params.keys()].every((key) => key === 'returnTo') && params.getAll('returnTo').length === 1 && returnTo && readCreatorReturnTo(locale, returnTo) ? value : undefined
  }

  const exactPaths = new Set([`${base}/profile`])
  if (exactPaths.has(pathname)) return hasOnlyQueryKeys(query, []) ? value : undefined

  const cursorPaths = new Set([`${base}/notifications`, `${base}/bookmarks`])
  if (cursorPaths.has(pathname)) return hasOnlyQueryKeys(query, ['cursor']) ? value : undefined

  if (new RegExp(`^${base}/posts/[^/?#%]+$`).test(pathname)) return hasOnlyQueryKeys(query, ['commentCursor']) ? value : undefined
  if (new RegExp(`^${base}/profiles/[^/?#%]+$`).test(pathname)) return hasOnlyQueryKeys(query, ['cursor']) ? value : undefined
  if (new RegExp(`^${base}/creator/[^/?#%]+$`).test(pathname)) return hasOnlyQueryKeys(query, []) ? value : undefined
  return undefined
}
