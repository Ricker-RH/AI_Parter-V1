'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useEffect, useRef, useState, type ReactNode, type SVGProps} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import type {SocialLabels} from './types'
import {useIntentPrefetch} from './useIntentPrefetch'

type ActionLabels = Pick<SocialLabels, 'bookmark' | 'follow' | 'followingAction' | 'interactionError' | 'like' | 'removeBookmark' | 'unlike'> & Pick<Partial<SocialLabels>, 'comments' | 'share'>

type PostActionsProps = {
  postId: string
  liked: boolean
  bookmarked: boolean
  labels: ActionLabels
  locale: Locale
  likeCount: number
  commentCount: number
  bookmarkCount: number
  shareCount: number
  authorId?: string
  followsAuthor?: boolean
  canMutate?: boolean
  returnTo?: string
  variant?: 'feed' | 'detail'
  viewerScope?: string
}

type AsyncAction = 'like' | 'bookmark' | 'share'
type RelationshipAction = Exclude<AsyncAction, 'share'>
type ActionState = {
  like: boolean
  bookmark: boolean
  likeCount: number
  bookmarkCount: number
  shareCount: number
  pending: Record<AsyncAction, boolean>
  errors: Record<AsyncAction, boolean>
}

function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
}

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="M20 11.4a7.5 7.5 0 0 1-8 7.4 9.4 9.4 0 0 1-3.8-.8L4 19.5l1.3-4A7.4 7.4 0 1 1 20 11.4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
}

function BookmarkIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="M6.5 4.5h11v15L12 16l-5.5 3.5v-15Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
}

function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return <svg fill="none" viewBox="0 0 24 24" {...props}><path d="m4 12 16-8-5.6 16-3.1-6.3L4 12Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/></svg>
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

function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale).format(value)
}

function formatVisibleCount(value: number, locale: Locale, variant: 'feed' | 'detail') {
  return variant === 'feed'
    ? new Intl.NumberFormat(locale, {maximumSignificantDigits: 2, notation: 'compact'}).format(value)
    : formatCount(value, locale)
}

function actionLabel(label: string, count: number, locale: Locale) {
  return `${label} ${formatCount(count, locale)}`
}

function Count({children, locale, variant='feed'}: {children: number; locale: Locale; variant?: 'feed' | 'detail'}) {
  return <span aria-hidden="true">{formatVisibleCount(children, locale, variant)}</span>
}

async function completeBrowserShare(url: string): Promise<'completed' | 'cancelled'> {
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
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, 250)
    signal.addEventListener('abort', onAbort, {once: true})
  })
}

async function recordCompletedShare(postId: string, idempotencyKey: string, signal: AbortSignal): Promise<{created: boolean}> {
  let lastError: unknown = new Error('share record failed')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response
    try {
      response = await fetch(`/api/social/posts/${postId}/share`, {credentials: 'include', headers: {'idempotency-key': idempotencyKey}, method: 'POST', signal})
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      if (attempt === 0) {
        await retryDelay(signal)
        continue
      }
      throw error
    }
    if (!response.ok) {
      lastError = new Error('share record failed')
      if (attempt === 0 && response.status >= 500) {
        await retryDelay(signal)
        continue
      }
      throw lastError
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error('share record failed')
    }
    if (!validCreatedResponse(body)) throw new Error('share record failed')
    return body
  }
  throw lastError
}

function ActionFrame({afterComment, beforeComment, commentActive, commentsLabel, commentCount, feedback, locale, postId, shareAction, variant}: {
  afterComment: ReactNode
  beforeComment: ReactNode
  commentActive: boolean
  commentsLabel: string
  commentCount: number
  feedback: ReactNode
  locale: Locale
  postId: string
  shareAction: ReactNode
  variant: 'feed' | 'detail'
}) {
  const {intentHandlers} = useIntentPrefetch()
  const postHref = `/${locale}/posts/${postId}`
  return <footer aria-label={commentsLabel} className="post-actions">
    <div className="post-actions__controls post-action-controls">
      {beforeComment}
      <Link {...intentHandlers(postHref)} aria-current={commentActive ? 'page' : undefined} aria-label={actionLabel(commentsLabel, commentCount, locale)} className="post-action" href={postHref} prefetch={false} title={actionLabel(commentsLabel, commentCount, locale)}><CommentIcon aria-hidden="true" fill={commentActive ? 'currentColor' : 'none'}/><Count locale={locale} variant={variant}>{commentCount}</Count></Link>
      {afterComment}
      {shareAction}
    </div>
    <div aria-atomic="false" className="post-actions__feedback post-action-feedback">{feedback}</div>
  </footer>
}

function AuthenticatedActions({bookmarked, bookmarkCount, commentCount, labels, liked, likeCount, locale, postId, shareCount, variant='feed', viewerScope}: PostActionsProps & {viewerScope: string}) {
  const scope = JSON.stringify([viewerScope, postId, liked, bookmarked, likeCount, bookmarkCount, shareCount, locale, variant])
  return <ScopedAuthenticatedActions key={scope} bookmarked={bookmarked} bookmarkCount={bookmarkCount} commentCount={commentCount} labels={labels} liked={liked} likeCount={likeCount} locale={locale} postId={postId} shareCount={shareCount} variant={variant}/>
}

function ScopedAuthenticatedActions({bookmarked, bookmarkCount, commentCount, labels, liked, likeCount, locale, postId, shareCount, variant}: Pick<PostActionsProps, 'bookmarked' | 'bookmarkCount' | 'commentCount' | 'labels' | 'liked' | 'likeCount' | 'locale' | 'postId' | 'shareCount' | 'variant'> & {variant: 'feed' | 'detail'}) {
  const router = useRouter()
  const [state, setState] = useState<ActionState>({like: liked, bookmark: bookmarked, likeCount, bookmarkCount, shareCount, pending: {like: false, bookmark: false, share: false}, errors: {like: false, bookmark: false, share: false}})
  const mutationId = useRef<Record<AsyncAction, number>>({like: 0, bookmark: 0, share: 0})
  const controllers = useRef<Partial<Record<AsyncAction, AbortController>>>({})

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
      const response = await fetch(`/api/social/posts/${postId}/${action}`, {credentials: 'include', method, signal: controller.signal})
      if (!isCurrent()) return
      if (response.status === 401) {
        setState((current) => ({...current, [action]: active, [countKey]: previousCount}))
        router.replace(authHref(locale, `${window.location.pathname}${window.location.search}`))
        return
      }
      const body: unknown = await response.json()
      if (!response.ok || !validMutationResponse(body, method)) throw new Error('mutation failed')
      const changed = method === 'PUT'
        ? (body as {created: boolean}).created
        : (body as {deleted: boolean}).deleted
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

  async function share() {
    if (state.pending.share) return
    const requestId = ++mutationId.current.share
    const controller = new AbortController()
    controllers.current.share = controller
    const isCurrent = () => !controller.signal.aborted && mutationId.current.share === requestId
    setState((current) => ({...current, pending: {...current.pending, share: true}, errors: {...current.errors, share: false}}))
    try {
      const url = new URL(`/${locale}/posts/${postId}`, window.location.origin).toString()
      if (await completeBrowserShare(url) === 'cancelled' || !isCurrent()) return
      await recordCompletedShare(postId, crypto.randomUUID(), controller.signal)
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

  const commentsLabel = labels.comments ?? 'Comments'
  const likeLabel = state.like ? labels.unlike : labels.like
  const bookmarkLabel = state.bookmark ? labels.removeBookmark : labels.bookmark
  const likeAction = <button aria-busy={state.pending.like} aria-label={actionLabel(likeLabel, state.likeCount, locale)} aria-pressed={state.like} className="post-action" disabled={state.pending.like} onClick={() => void mutate('like')} title={actionLabel(likeLabel, state.likeCount, locale)} type="button"><HeartIcon aria-hidden="true" fill={state.like ? 'currentColor' : 'none'}/><Count locale={locale} variant={variant}>{state.likeCount}</Count></button>
  const bookmarkAction = <button aria-busy={state.pending.bookmark} aria-label={actionLabel(bookmarkLabel, state.bookmarkCount, locale)} aria-pressed={state.bookmark} className="post-action" disabled={state.pending.bookmark} onClick={() => void mutate('bookmark')} title={actionLabel(bookmarkLabel, state.bookmarkCount, locale)} type="button"><BookmarkIcon aria-hidden="true" fill={state.bookmark ? 'currentColor' : 'none'}/><Count locale={locale} variant={variant}>{state.bookmarkCount}</Count></button>
  const shareAction = <button aria-busy={state.pending.share} aria-label={actionLabel(labels.share ?? 'Share', state.shareCount, locale)} className="post-action" disabled={state.pending.share} onClick={() => void share()} title={actionLabel(labels.share ?? 'Share', state.shareCount, locale)} type="button"><ShareIcon aria-hidden="true"/><Count locale={locale} variant={variant}>{state.shareCount}</Count></button>
  const feedback = (['like', 'bookmark', 'share'] as const).map((action) => state.errors[action] ? <span className="interaction-error" data-action={action} key={action} role="status">{labels.interactionError}</span> : null)
  return <ActionFrame afterComment={bookmarkAction} beforeComment={likeAction} commentActive={variant === 'detail'} commentCount={commentCount} commentsLabel={commentsLabel} feedback={feedback} locale={locale} postId={postId} shareAction={shareAction} variant={variant}/>
}

function GuestActions(props: PostActionsProps) {
  const variant = props.variant ?? 'feed'
  const scope = JSON.stringify([props.postId, props.shareCount, props.locale, variant])
  return <ScopedGuestActions key={scope} {...props} variant={variant}/>
}

function ScopedGuestActions({bookmarkCount, commentCount, labels, likeCount, locale, postId, returnTo=`/${locale}`, shareCount, variant}: PostActionsProps & {variant: 'feed' | 'detail'}) {
  const gatedHref = authHref(locale, returnTo)
  const {intentHandlers} = useIntentPrefetch()
  const [state, setState] = useState({shareCount, pending: false, error: false})
  const mutationId = useRef(0)
  const controller = useRef<AbortController | undefined>(undefined)

  useEffect(() => () => controller.current?.abort(), [])

  async function share() {
    if (state.pending) return
    const requestId = ++mutationId.current
    const activeController = new AbortController()
    controller.current = activeController
    const isCurrent = () => !activeController.signal.aborted && mutationId.current === requestId
    setState((current) => ({...current, pending: true, error: false}))
    try {
      const url = new URL(`/${locale}/posts/${postId}`, window.location.origin).toString()
      if (await completeBrowserShare(url) === 'cancelled' || !isCurrent()) return
      await recordCompletedShare(postId, crypto.randomUUID(), activeController.signal)
      if (isCurrent()) setState((current) => ({...current, shareCount: current.shareCount + 1}))
    } catch {
      if (isCurrent()) setState((current) => ({...current, error: true}))
    } finally {
      if (isCurrent()) {
        controller.current = undefined
        setState((current) => ({...current, pending: false}))
      }
    }
  }

  const likeAction = <Link {...intentHandlers(gatedHref)} aria-label={actionLabel(labels.like, likeCount, locale)} className="post-action" href={gatedHref} prefetch={false} title={actionLabel(labels.like, likeCount, locale)}><HeartIcon aria-hidden="true"/><Count locale={locale} variant={variant}>{likeCount}</Count></Link>
  const bookmarkAction = <Link {...intentHandlers(gatedHref)} aria-label={actionLabel(labels.bookmark, bookmarkCount, locale)} className="post-action" href={gatedHref} prefetch={false} title={actionLabel(labels.bookmark, bookmarkCount, locale)}><BookmarkIcon aria-hidden="true"/><Count locale={locale} variant={variant}>{bookmarkCount}</Count></Link>
  const shareAction = <button aria-busy={state.pending} aria-label={actionLabel(labels.share ?? 'Share', state.shareCount, locale)} className="post-action" disabled={state.pending} onClick={() => void share()} title={actionLabel(labels.share ?? 'Share', state.shareCount, locale)} type="button"><ShareIcon aria-hidden="true"/><Count locale={locale} variant={variant}>{state.shareCount}</Count></button>
  const feedback = state.error ? <span className="interaction-error" data-action="share" role="status">{labels.interactionError}</span> : null
  return <ActionFrame afterComment={bookmarkAction} beforeComment={likeAction} commentActive={variant === 'detail'} commentCount={commentCount} commentsLabel={labels.comments ?? 'Comments'} feedback={feedback} locale={locale} postId={postId} shareAction={shareAction} variant={variant}/>
}

export function PostActions(props: PostActionsProps) {
  if (props.canMutate === undefined) return <AuthenticatedActions {...props} viewerScope={props.viewerScope ?? 'legacy-test-scope'}/>
  return props.canMutate && props.viewerScope ? <AuthenticatedActions {...props} viewerScope={props.viewerScope}/> : <GuestActions {...props}/>
}
