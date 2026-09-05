'use client'

import {useRouter} from 'next/navigation'
import {useEffect, useRef, useState, type ReactNode, type SVGProps} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'

export type AsyncEntityAction = 'like' | 'bookmark' | 'share'
type RelationshipAction = Exclude<AsyncEntityAction, 'share'>
type EntityActionState = {
  like: boolean
  bookmark: boolean
  likeCount: number
  bookmarkCount: number
  shareCount: number
  pending: Record<AsyncEntityAction, boolean>
  errors: Record<AsyncEntityAction, boolean>
}

export function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
}

export function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="M20 11.4a7.5 7.5 0 0 1-8 7.4 9.4 9.4 0 0 1-3.8-.8L4 19.5l1.3-4A7.4 7.4 0 1 1 20 11.4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
}

export function BookmarkIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="M6.5 4.5h11v15L12 16l-5.5 3.5v-15Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
}

export function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="m4 12 16-8-5.6 16-3.1-6.3L4 12Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
}

export function formatEntityCount(value: number, locale: Locale, compact: boolean) {
  return compact
    ? new Intl.NumberFormat(locale, {maximumSignificantDigits: 2, notation: 'compact'}).format(value)
    : new Intl.NumberFormat(locale).format(value)
}

export function entityActionLabel(label: string, count: number, locale: Locale) {
  return `${label} ${new Intl.NumberFormat(locale).format(count)}`
}

export function EntityActionRow({children, feedback, label, className=''}: {children: ReactNode; feedback: ReactNode; label: string; className?: string}) {
  return <footer aria-label={label} className={`post-actions entity-actions ${className}`.trim()}>
    <div className="post-actions__controls entity-actions__controls">{children}</div>
    <div aria-atomic="false" className="post-actions__feedback entity-actions__feedback">{feedback}</div>
  </footer>
}

function validMutationResponse(value: unknown, method: 'PUT' | 'DELETE'): boolean {
  if (typeof value !== 'object' || value === null) return false
  const entries = Object.entries(value)
  const expected = method === 'PUT' ? 'created' : 'deleted'
  return entries.length === 1 && entries[0]?.[0] === expected && typeof entries[0][1] === 'boolean'
}

function validCreatedResponse(value: unknown): value is {created: boolean} {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 1 && typeof (value as {created?: unknown}).created === 'boolean'
}

export async function completeBrowserShare(url: string): Promise<'completed' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({url})
      return 'completed'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  }
  if (!navigator.clipboard?.writeText) throw new Error('share unavailable')
  await navigator.clipboard.writeText(url)
  return 'completed'
}

function retryDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const onAbort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, 250)
    signal.addEventListener('abort', onAbort, {once: true})
  })
}

async function recordCompletedShare(entityPath: string, idempotencyKey: string, signal: AbortSignal): Promise<{created: boolean}> {
  let lastError: unknown = new Error('share record failed')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response
    try {
      response = await fetch(`/api/social/${entityPath}/share`, {credentials: 'include', headers: {'idempotency-key': idempotencyKey}, method: 'POST', signal})
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      if (attempt === 0) { await retryDelay(signal); continue }
      throw error
    }
    if (!response.ok) {
      lastError = new Error('share record failed')
      if (attempt === 0 && response.status >= 500) { await retryDelay(signal); continue }
      throw lastError
    }
    let body: unknown
    try { body = await response.json() } catch { throw new Error('share record failed') }
    if (!validCreatedResponse(body)) throw new Error('share record failed')
    return body
  }
  throw lastError
}

export function useEntityInteractionController({bookmarked, bookmarkCount, canonicalUrl, entityPath, liked, likeCount, locale, shareCount}: {
  bookmarked: boolean
  bookmarkCount: number
  canonicalUrl: string
  entityPath: string
  liked: boolean
  likeCount: number
  locale: Locale
  shareCount: number
}) {
  const router = useRouter()
  const [state, setState] = useState<EntityActionState>({like: liked, bookmark: bookmarked, likeCount, bookmarkCount, shareCount, pending: {like: false, bookmark: false, share: false}, errors: {like: false, bookmark: false, share: false}})
  const mutationId = useRef<Record<AsyncEntityAction, number>>({like: 0, bookmark: 0, share: 0})
  const controllers = useRef<Partial<Record<AsyncEntityAction, AbortController>>>({})

  useEffect(() => () => { for (const controller of Object.values(controllers.current)) controller?.abort() }, [])

  async function mutate(action: RelationshipAction) {
    if (state.pending[action]) return
    const active = state[action]
    const countKey = action === 'like' ? 'likeCount' : 'bookmarkCount'
    const previousCount = state[countKey]
    const next = !active
    const method = active ? 'DELETE' : 'PUT'
    const requestId = ++mutationId.current[action]
    const controller = new AbortController()
    controllers.current[action] = controller
    const isCurrent = () => !controller.signal.aborted && mutationId.current[action] === requestId
    setState((current) => ({...current, [action]: next, [countKey]: Math.max(0, previousCount + (next ? 1 : -1)), pending: {...current.pending, [action]: true}, errors: {...current.errors, [action]: false}}))
    try {
      const response = await fetch(`/api/social/${entityPath}/${action}`, {credentials: 'include', method, signal: controller.signal})
      if (!isCurrent()) return
      if (response.status === 401) {
        setState((current) => ({...current, [action]: active, [countKey]: previousCount}))
        router.replace(authHref(locale, `${window.location.pathname}${window.location.search}`))
        return
      }
      const body: unknown = await response.json()
      if (!response.ok || !validMutationResponse(body, method)) throw new Error('mutation failed')
      const changed = method === 'PUT' ? (body as {created: boolean}).created : (body as {deleted: boolean}).deleted
      if (!changed && isCurrent()) setState((current) => ({...current, [countKey]: previousCount}))
    } catch {
      if (isCurrent()) setState((current) => ({...current, [action]: active, [countKey]: previousCount, errors: {...current.errors, [action]: true}}))
    } finally {
      if (isCurrent()) {
        delete controllers.current[action]
        setState((current) => ({...current, pending: {...current.pending, [action]: false}}))
      }
    }
  }

  async function share(completed = false) {
    if (state.pending.share) return
    const requestId = ++mutationId.current.share
    const controller = new AbortController()
    controllers.current.share = controller
    const isCurrent = () => !controller.signal.aborted && mutationId.current.share === requestId
    setState((current) => ({...current, pending: {...current.pending, share: true}, errors: {...current.errors, share: false}}))
    try {
      if ((!completed && await completeBrowserShare(new URL(canonicalUrl, window.location.origin).toString()) === 'cancelled') || !isCurrent()) return
      await recordCompletedShare(entityPath, crypto.randomUUID(), controller.signal)
      if (isCurrent()) setState((current) => ({...current, shareCount: current.shareCount + 1}))
    } catch {
      if (isCurrent()) setState((current) => ({...current, errors: {...current.errors, share: true}}))
    } finally {
      if (isCurrent()) {
        delete controllers.current.share
        setState((current) => ({...current, pending: {...current.pending, share: false}}))
      }
    }
  }

  return {mutate, share, state}
}

export function useShareController({canonicalUrl, entityPath, shareCount}: {canonicalUrl: string; entityPath: string; shareCount: number}) {
  const [state, setState] = useState({shareCount, pending: false, error: false})
  const mutationId = useRef(0)
  const controller = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => controller.current?.abort(), [])
  async function share(completed = false) {
    if (state.pending) return
    const requestId = ++mutationId.current
    const activeController = new AbortController()
    controller.current = activeController
    const isCurrent = () => !activeController.signal.aborted && mutationId.current === requestId
    setState((current) => ({...current, pending: true, error: false}))
    try {
      if ((!completed && await completeBrowserShare(new URL(canonicalUrl, window.location.origin).toString()) === 'cancelled') || !isCurrent()) return
      await recordCompletedShare(entityPath, crypto.randomUUID(), activeController.signal)
      if (isCurrent()) setState((current) => ({...current, shareCount: current.shareCount + 1}))
    } catch {
      if (isCurrent()) setState((current) => ({...current, error: true}))
    } finally {
      if (isCurrent()) { controller.current = undefined; setState((current) => ({...current, pending: false})) }
    }
  }
  return {share, state}
}
