'use client'

import {useRouter} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import type {SocialLabels} from './types'
import {BookmarkIcon, CommentIcon, EntityActionRow, HeartIcon, ShareIcon, entityActionLabel, formatEntityCount, useEntityInteractionController, useShareController} from './EntityActions'

type Labels = Pick<SocialLabels, 'bookmark' | 'interactionError' | 'like' | 'removeBookmark' | 'reply' | 'unlike'> & Pick<Partial<SocialLabels>, 'comments' | 'share'>

type CommentActionsProps = {
  bookmarked: boolean
  bookmarkCount: number
  canMutate: boolean
  commentId: string
  labels: Labels
  liked: boolean
  likeCount: number
  locale: Locale
  onReply(): void
  postId: string
  replyCount: number
  returnTo?: string
  shareCount: number
  viewerScope?: string
}

function Count({children, locale}: {children: number; locale: Locale}) {
  return <span aria-hidden="true">{formatEntityCount(children, locale, true)}</span>
}

function Frame({bookmarkAction, feedback, likeAction, locale, onReply, replyCount, replyLabel, shareAction}: {bookmarkAction: React.ReactNode; feedback: React.ReactNode; likeAction: React.ReactNode; locale: Locale; onReply(): void; replyCount: number; replyLabel: string; shareAction: React.ReactNode}) {
  const label = entityActionLabel(replyLabel, replyCount, locale)
  return <EntityActionRow className="comment-actions" feedback={feedback} label={replyLabel}>
      {likeAction}
      <button aria-label={label} className="post-action" onClick={onReply} title={label} type="button"><CommentIcon aria-hidden="true"/><Count locale={locale}>{replyCount}</Count></button>
      {bookmarkAction}
      {shareAction}
  </EntityActionRow>
}

function AuthenticatedCommentActions(props: CommentActionsProps & {viewerScope: string}) {
  const scope = JSON.stringify([props.viewerScope, props.commentId, props.liked, props.bookmarked, props.likeCount, props.bookmarkCount, props.shareCount, props.locale])
  return <ScopedAuthenticatedCommentActions key={scope} {...props}/>
}

function ScopedAuthenticatedCommentActions({bookmarked, bookmarkCount, commentId, labels, liked, likeCount, locale, onReply, postId, replyCount, shareCount}: CommentActionsProps & {viewerScope: string}) {
  const entityPath = `comments/${commentId}`
  const canonicalUrl = `/${locale}/posts/${postId}#comment-${commentId}`
  const {mutate, share, state} = useEntityInteractionController({bookmarked, bookmarkCount, canonicalUrl, entityPath, liked, likeCount, locale, shareCount})
  const likeLabel = state.like ? labels.unlike : labels.like
  const bookmarkLabel = state.bookmark ? labels.removeBookmark : labels.bookmark
  const shareLabel = labels.share ?? 'Share'
  const likeAction = <button aria-busy={state.pending.like} aria-label={entityActionLabel(likeLabel, state.likeCount, locale)} aria-pressed={state.like} className="post-action" disabled={state.pending.like} onClick={() => void mutate('like')} title={entityActionLabel(likeLabel, state.likeCount, locale)} type="button"><HeartIcon aria-hidden="true" fill={state.like ? 'currentColor' : 'none'}/><Count locale={locale}>{state.likeCount}</Count></button>
  const bookmarkAction = <button aria-busy={state.pending.bookmark} aria-label={entityActionLabel(bookmarkLabel, state.bookmarkCount, locale)} aria-pressed={state.bookmark} className="post-action" disabled={state.pending.bookmark} onClick={() => void mutate('bookmark')} title={entityActionLabel(bookmarkLabel, state.bookmarkCount, locale)} type="button"><BookmarkIcon aria-hidden="true" fill={state.bookmark ? 'currentColor' : 'none'}/><Count locale={locale}>{state.bookmarkCount}</Count></button>
  const shareAction = <button aria-busy={state.pending.share} aria-label={entityActionLabel(shareLabel, state.shareCount, locale)} className="post-action" disabled={state.pending.share} onClick={() => void share()} title={entityActionLabel(shareLabel, state.shareCount, locale)} type="button"><ShareIcon aria-hidden="true"/><Count locale={locale}>{state.shareCount}</Count></button>
  const feedback = (['like', 'bookmark', 'share'] as const).map((action) => state.errors[action] ? <span className="interaction-error" data-action={action} key={action} role="status">{labels.interactionError}</span> : null)
  return <Frame bookmarkAction={bookmarkAction} feedback={feedback} likeAction={likeAction} locale={locale} onReply={onReply} replyCount={replyCount} replyLabel={labels.reply} shareAction={shareAction}/>
}

function GuestCommentActions(props: CommentActionsProps) {
  const scope = JSON.stringify([props.commentId, props.shareCount, props.locale])
  return <ScopedGuestCommentActions key={scope} {...props}/>
}

function ScopedGuestCommentActions({bookmarkCount, commentId, labels, likeCount, locale, onReply, postId, replyCount, returnTo, shareCount}: CommentActionsProps) {
  const router = useRouter()
  const gatedHref = authHref(locale, returnTo ?? `/${locale}/posts/${postId}`)
  const {share, state} = useShareController({canonicalUrl: `/${locale}/posts/${postId}#comment-${commentId}`, entityPath: `comments/${commentId}`, shareCount})
  const gated = () => router.replace(gatedHref)
  const likeAction = <button aria-label={entityActionLabel(labels.like, likeCount, locale)} className="post-action" onClick={gated} title={entityActionLabel(labels.like, likeCount, locale)} type="button"><HeartIcon aria-hidden="true"/><Count locale={locale}>{likeCount}</Count></button>
  const bookmarkAction = <button aria-label={entityActionLabel(labels.bookmark, bookmarkCount, locale)} className="post-action" onClick={gated} title={entityActionLabel(labels.bookmark, bookmarkCount, locale)} type="button"><BookmarkIcon aria-hidden="true"/><Count locale={locale}>{bookmarkCount}</Count></button>
  const shareLabel = labels.share ?? 'Share'
  const shareAction = <button aria-busy={state.pending} aria-label={entityActionLabel(shareLabel, state.shareCount, locale)} className="post-action" disabled={state.pending} onClick={() => void share()} title={entityActionLabel(shareLabel, state.shareCount, locale)} type="button"><ShareIcon aria-hidden="true"/><Count locale={locale}>{state.shareCount}</Count></button>
  const feedback = state.error ? <span className="interaction-error" data-action="share" role="status">{labels.interactionError}</span> : null
  return <Frame bookmarkAction={bookmarkAction} feedback={feedback} likeAction={likeAction} locale={locale} onReply={onReply} replyCount={replyCount} replyLabel={labels.reply} shareAction={shareAction}/>
}

export function CommentActions(props: CommentActionsProps) {
  return props.canMutate && props.viewerScope ? <AuthenticatedCommentActions {...props} viewerScope={props.viewerScope}/> : <GuestCommentActions {...props}/>
}
