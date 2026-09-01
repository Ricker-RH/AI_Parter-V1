import {
  ApiErrorSchema,
  FeedPageSchema,
  NotificationPageSchema,
  PostDetailSchema,
  PublicIpProfileSchema,
  type FeedPage,
  type FeedVisualType,
  type NotificationPage,
  type PostDetail,
  type PublicIpProfile,
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

async function request<T>(path: string, schema: Schema<T>, token?: string): Promise<SocialApiResult<T>> {
  try {
    const response = await fetchAifansApi(path, token ? {getToken: async () => token} : undefined)
    if (response.status === 401) return {status: 'auth-required'}
    const body: unknown = await response.json()
    if (response.ok) {
      const parsed = schema.safeParse(body)
      return parsed.success ? {status: 'ok', data: parsed.data} : {status: 'unavailable'}
    }

    const error = ApiErrorSchema.safeParse(body)
    if (!error.success) return {status: 'unavailable'}
    if (response.status === 404 && (error.data.code === 'POST_NOT_FOUND' || error.data.code === 'PROFILE_NOT_FOUND')) return {status: 'not-found'}
    return {status: 'unavailable'}
  } catch {
    return {status: 'unavailable'}
  }
}

export function fetchFeed({kind, locale, cookie, cursor, token, visualType = 'all'}: {kind: 'for_you' | 'following'; locale: Locale; cookie?: string | undefined; cursor?: string | undefined; token?: string | undefined; visualType?: FeedVisualType}) {
  const query = new URLSearchParams({kind, locale})
  if (visualType !== 'all') query.set('visualType', visualType)
  if (cursor) query.set('cursor', cursor)
  return request(`/v1/feed?${query}`, FeedPageSchema, token)
}

export function fetchPost(postId: string, {cookie, commentCursor, token}: {cookie?: string | undefined; commentCursor?: string | undefined; token?: string | undefined} = {}) {
  const query = new URLSearchParams()
  if (commentCursor) query.set('commentCursor', commentCursor)
  const suffix = query.size ? `?${query}` : ''
  return request<PostDetail>(`/v1/posts/${encodeURIComponent(postId)}${suffix}`, PostDetailSchema, token)
}

export function fetchPublicProfile(profileId: string, {cookie, cursor, token}: {cookie?: string | undefined; cursor?: string | undefined; token?: string | undefined} = {}): Promise<SocialApiResult<PublicIpProfile>> {
  const query=new URLSearchParams()
  if (cursor) query.set('cursor',cursor)
  return request(`/v1/profiles/${encodeURIComponent(profileId)}${query.size?`?${query}`:''}`,PublicIpProfileSchema,token)
}

export function fetchBookmarks({cookie, cursor, token}: {cookie?: string | undefined; cursor?: string | undefined; token?: string | undefined} = {}): Promise<SocialApiResult<FeedPage>> {
  const query = new URLSearchParams()
  if (cursor) query.set('cursor', cursor)
  return request(`/v1/bookmarks${query.size ? `?${query}` : ''}`, FeedPageSchema, token)
}

export function fetchNotifications({cookie, cursor, token}: {cookie?: string | undefined; cursor?: string | undefined; token?: string | undefined} = {}): Promise<SocialApiResult<NotificationPage>> {
  const query = new URLSearchParams()
  if (cursor) query.set('cursor', cursor)
  return request(`/v1/notifications${query.size ? `?${query}` : ''}`, NotificationPageSchema, token)
}
