import {
  ApiErrorSchema,
  FeedPageSchema,
  NotificationPageSchema,
  PostDetailSchema,
  type FeedPage,
  type FeedVisualType,
  type NotificationPage,
  type PostDetail,
} from '@aifans/contracts'
import type {Locale} from '../i18n/config'
import {fetchAifansApi, readApiBaseUrl} from './server-api'

export type SocialApiResult<T> =
  | {status: 'ok'; data: T}
  | {status: 'auth-required'}
  | {status: 'not-found'}
  | {status: 'unavailable'}

type Schema<T> = {safeParse(value: unknown): {success: true; data: T} | {success: false}}

export function socialApiBaseUrl(): string | null {
  return readApiBaseUrl()
}

async function request<T>(path: string, schema: Schema<T>, cookie?: string): Promise<SocialApiResult<T>> {
  try {
    const response = await fetchAifansApi(path)
    const body: unknown = await response.json()
    if (response.ok) {
      const parsed = schema.safeParse(body)
      return parsed.success ? {status: 'ok', data: parsed.data} : {status: 'unavailable'}
    }

    const error = ApiErrorSchema.safeParse(body)
    if (!error.success) return {status: 'unavailable'}
    if (response.status === 401 && (error.data.code === 'AUTH_REQUIRED' || error.data.code === 'AUTH_INVALID')) {
      return {status: 'auth-required'}
    }
    if (response.status === 404 && error.data.code === 'POST_NOT_FOUND') return {status: 'not-found'}
    return {status: 'unavailable'}
  } catch {
    return {status: 'unavailable'}
  }
}

export function fetchFeed({kind, locale, cookie, cursor, visualType = 'all'}: {kind: 'for_you' | 'following'; locale: Locale; cookie?: string | undefined; cursor?: string | undefined; visualType?: FeedVisualType}) {
  const query = new URLSearchParams({kind, locale})
  if (visualType !== 'all') query.set('visualType', visualType)
  if (cursor) query.set('cursor', cursor)
  return request(`/v1/feed?${query}`, FeedPageSchema, cookie)
}

export function fetchPost(postId: string, {cookie, commentCursor}: {cookie?: string | undefined; commentCursor?: string | undefined} = {}) {
  const query = new URLSearchParams()
  if (commentCursor) query.set('commentCursor', commentCursor)
  const suffix = query.size ? `?${query}` : ''
  return request<PostDetail>(`/v1/posts/${encodeURIComponent(postId)}${suffix}`, PostDetailSchema, cookie)
}

export function fetchBookmarks({cookie, cursor}: {cookie?: string | undefined; cursor?: string | undefined} = {}): Promise<SocialApiResult<FeedPage>> {
  const query = new URLSearchParams()
  if (cursor) query.set('cursor', cursor)
  return request(`/v1/bookmarks${query.size ? `?${query}` : ''}`, FeedPageSchema, cookie)
}

export function fetchNotifications({cookie, cursor}: {cookie?: string | undefined; cursor?: string | undefined} = {}): Promise<SocialApiResult<NotificationPage>> {
  const query = new URLSearchParams()
  if (cursor) query.set('cursor', cursor)
  return request(`/v1/notifications${query.size ? `?${query}` : ''}`, NotificationPageSchema, cookie)
}
