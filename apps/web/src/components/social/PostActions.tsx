'use client'

import Link from 'next/link'
import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import type {SocialLabels} from './types'
import {useIntentPrefetch} from './useIntentPrefetch'
import {BookmarkIcon, CommentIcon, EntityActionRow, HeartIcon, ShareIcon, entityActionLabel, formatEntityCount, useEntityInteractionController, useShareController} from './EntityActions'

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

function formatCount(value: number, locale: Locale) {
  return formatEntityCount(value, locale, false)
}

function formatVisibleCount(value: number, locale: Locale, variant: 'feed' | 'detail') {
  return variant === 'feed'
    ? formatEntityCount(value, locale, true)
    : formatCount(value, locale)
}

function actionLabel(label: string, count: number, locale: Locale) {
  return entityActionLabel(label, count, locale)
}

function Count({children, locale, variant='feed'}: {children: number; locale: Locale; variant?: 'feed' | 'detail'}) {
  return <span aria-hidden="true">{formatVisibleCount(children, locale, variant)}</span>
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
  return <EntityActionRow feedback={feedback} label={commentsLabel}>
      {beforeComment}
      <Link {...intentHandlers(postHref)} aria-current={commentActive ? 'page' : undefined} aria-label={actionLabel(commentsLabel, commentCount, locale)} className="post-action" href={postHref} prefetch={false} title={actionLabel(commentsLabel, commentCount, locale)}><CommentIcon aria-hidden="true" fill={commentActive ? 'currentColor' : 'none'}/><Count locale={locale} variant={variant}>{commentCount}</Count></Link>
      {afterComment}
      {shareAction}
  </EntityActionRow>
}

function AuthenticatedActions({bookmarked, bookmarkCount, commentCount, labels, liked, likeCount, locale, postId, shareCount, variant='feed', viewerScope}: PostActionsProps & {viewerScope: string}) {
  const scope = JSON.stringify([viewerScope, postId, liked, bookmarked, likeCount, bookmarkCount, shareCount, locale, variant])
  return <ScopedAuthenticatedActions key={scope} bookmarked={bookmarked} bookmarkCount={bookmarkCount} commentCount={commentCount} labels={labels} liked={liked} likeCount={likeCount} locale={locale} postId={postId} shareCount={shareCount} variant={variant}/>
}

function ScopedAuthenticatedActions({bookmarked, bookmarkCount, commentCount, labels, liked, likeCount, locale, postId, shareCount, variant}: Pick<PostActionsProps, 'bookmarked' | 'bookmarkCount' | 'commentCount' | 'labels' | 'liked' | 'likeCount' | 'locale' | 'postId' | 'shareCount' | 'variant'> & {variant: 'feed' | 'detail'}) {
  const {mutate, share, state} = useEntityInteractionController({bookmarked, bookmarkCount, canonicalUrl: `/${locale}/posts/${postId}`, entityPath: `posts/${postId}`, liked, likeCount, locale, shareCount})

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
  const {share, state} = useShareController({canonicalUrl: `/${locale}/posts/${postId}`, entityPath: `posts/${postId}`, shareCount})

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
