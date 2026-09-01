'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useState, type ReactNode, type SVGProps} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import type {SocialLabels} from './types'

type ActionLabels = Pick<
  SocialLabels,
  'bookmark' | 'follow' | 'followingAction' | 'interactionError' | 'like' | 'removeBookmark' | 'unlike'
> & Pick<Partial<SocialLabels>, 'comments' | 'share'>

type PostActionsProps = {
  postId: string
  authorId?: string
  liked: boolean
  bookmarked: boolean
  followsAuthor?: boolean
  labels: ActionLabels
  locale: Locale
  canMutate?: boolean
  commentCount?: number
  likeCount?: number
  returnTo?: string
}

type MutationAction = 'like' | 'bookmark'

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

function Count({children}: {children: number | undefined}) {
  return children === undefined ? null : <span>{children}</span>
}

function ShareButton({label, postId, locale}: {label: string; postId: string; locale: Locale}) {
  async function share() {
    const path = `/${locale}/posts/${postId}`
    const url = typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString()
    try {
      if (navigator.share) await navigator.share({url})
      else await navigator.clipboard?.writeText(url)
    } catch {
      // Native share cancellation is not an error.
    }
  }
  return <button aria-label={label} className="post-action" onClick={() => void share()} type="button"><ShareIcon aria-hidden="true"/></button>
}

function ActionFrame({afterComment, beforeComment, commentsLabel, commentCount, locale, postId, shareLabel}: {
  afterComment: ReactNode
  beforeComment: ReactNode
  commentsLabel: string
  commentCount: number | undefined
  locale: Locale
  postId: string
  shareLabel: string
}) {
  return <footer aria-label={commentsLabel} className="post-actions">
    {beforeComment}
    <Link aria-label={commentsLabel} className="post-action" href={`/${locale}/posts/${postId}`}><CommentIcon aria-hidden="true"/><Count>{commentCount}</Count></Link>
    {afterComment}
    <ShareButton label={shareLabel} locale={locale} postId={postId}/>
  </footer>
}

function AuthenticatedActions({bookmarked, commentCount, labels, liked, likeCount, locale, postId}: PostActionsProps) {
  const router = useRouter()
  const [state, setState] = useState({like: liked, bookmark: bookmarked})
  const [pending, setPending] = useState<MutationAction | null>(null)
  const [error, setError] = useState(false)

  async function mutate(action: MutationAction) {
    const active = state[action]
    const method = active ? 'DELETE' : 'PUT'
    setPending(action)
    setError(false)
    try {
      const response = await fetch(`/api/social/posts/${postId}/${action}`, {credentials: 'include', method})
      if (response.status === 401) {
        router.replace(authHref(locale, `${window.location.pathname}${window.location.search}`))
        return
      }
      const body: unknown = await response.json()
      if (!response.ok || !validMutationResponse(body, method)) throw new Error('mutation failed')
      setState((current) => ({...current, [action]: !active}))
      router.refresh()
    } catch {
      setError(true)
    } finally {
      setPending(null)
    }
  }

  const commentsLabel = labels.comments ?? 'Comments'
  const likeLabel = state.like ? labels.unlike : labels.like
  const bookmarkLabel = state.bookmark ? labels.removeBookmark : labels.bookmark
  const likeAction = <button aria-busy={pending === 'like'} aria-label={likeLabel} aria-pressed={state.like} className="post-action" disabled={pending !== null} onClick={() => void mutate('like')} type="button"><HeartIcon aria-hidden="true"/><Count>{likeCount}</Count></button>
  const bookmarkAction = <><button aria-busy={pending === 'bookmark'} aria-label={bookmarkLabel} aria-pressed={state.bookmark} className="post-action" disabled={pending !== null} onClick={() => void mutate('bookmark')} type="button"><BookmarkIcon aria-hidden="true"/></button>{error ? <span className="interaction-error" role="status">{labels.interactionError}</span> : null}</>

  return <ActionFrame afterComment={bookmarkAction} beforeComment={likeAction} commentCount={commentCount} commentsLabel={commentsLabel} locale={locale} postId={postId} shareLabel={labels.share ?? 'Share'}/>
}

function GuestActions({commentCount, labels, likeCount, locale, postId, returnTo=`/${locale}`}: PostActionsProps) {
  const gatedHref = authHref(locale, returnTo)
  const likeAction = <Link aria-label={labels.like} className="post-action" href={gatedHref}><HeartIcon aria-hidden="true"/><Count>{likeCount}</Count></Link>
  const bookmarkAction = <Link aria-label={labels.bookmark} className="post-action" href={gatedHref}><BookmarkIcon aria-hidden="true"/></Link>
  return <ActionFrame afterComment={bookmarkAction} beforeComment={likeAction} commentCount={commentCount} commentsLabel={labels.comments ?? 'Comments'} locale={locale} postId={postId} shareLabel={labels.share ?? 'Share'}/>
}

export function PostActions(props: PostActionsProps) {
  return props.canMutate === false ? <GuestActions {...props}/> : <AuthenticatedActions {...props}/>
}
