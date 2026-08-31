import {
  ApiErrorSchema,
  FeedPageSchema,
  NotificationPageSchema,
  PostDetailSchema,
  type FeedPage,
  type NotificationPage,
  type PostDetail,
} from '@aifans/contracts'
import type {Locale} from '../i18n/config'

export type SocialApiResult<T> =
  | {status: 'ok'; data: T}
  | {status: 'auth-required'}
  | {status: 'not-found'}
  | {status: 'unavailable'}

type Schema<T> = {safeParse(value: unknown): {success: true; data: T} | {success: false}}

function apiBaseUrl(): string | null {
  const configured = process.env.AIFANS_API_URL || process.env.NEXT_PUBLIC_AIFANS_API_URL
  return configured?.trim() ? configured.trim().replace(/\/+$/, '') : null
}

export function publicSocialApiUrl(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_AIFANS_API_URL
  return configured?.trim() ? configured.trim().replace(/\/+$/, '') : undefined
}

async function request<T>(path: string, schema: Schema<T>, cookie?: string): Promise<SocialApiResult<T>> {
  const baseUrl = apiBaseUrl()
  if (!baseUrl) return {status: 'unavailable'}

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      credentials: 'include',
      ...(cookie ? {headers: {cookie}} : {}),
    })
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

export function fetchFeed({kind, locale, cookie}: {kind: 'for_you' | 'following'; locale: Locale; cookie?: string | undefined}) {
  const query = new URLSearchParams({kind, locale})
  return request(`/v1/feed?${query}`, FeedPageSchema, cookie)
}

export function fetchPost(postId: string, cookie?: string) {
  return request<PostDetail>(`/v1/posts/${encodeURIComponent(postId)}`, PostDetailSchema, cookie)
}

export function fetchBookmarks(cookie?: string): Promise<SocialApiResult<FeedPage>> {
  return request('/v1/bookmarks', FeedPageSchema, cookie)
}

export function fetchNotifications(cookie?: string): Promise<SocialApiResult<NotificationPage>> {
  return request('/v1/notifications', NotificationPageSchema, cookie)
}
