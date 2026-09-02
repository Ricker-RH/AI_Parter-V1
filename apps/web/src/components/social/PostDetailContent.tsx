'use client'

import type {PostDetail} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {CommentComposer} from './CommentComposer'
import {formatRelativeDuration} from '../../lib/relative-time'
import {useEffect, useState} from 'react'
import {AuthorPreview} from './AuthorPreview'

type Comment = PostDetail['comments']['items'][number]

type StoredComments = {
  localIds: string[]
  scope: string | null
  serverItems: Comment[] | null
  comments: Comment[]
}

const profileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hasValidProfileId(value: unknown): value is {profileId: string} {
  return typeof value === 'object'
    && value !== null
    && 'profileId' in value
    && typeof value.profileId === 'string'
    && profileIdPattern.test(value.profileId)
}

function reconcileComments(current: StoredComments, serverItems: Comment[]): StoredComments {
  const serverIds = new Set(serverItems.map((comment) => comment.id))
  const localIds = current.localIds.filter((id) => !serverIds.has(id))
  const retainedLocalComments = current.comments.filter((comment) => localIds.includes(comment.id) && !serverIds.has(comment.id))
  return {...current, comments: [...serverItems, ...retainedLocalComments], localIds, serverItems}
}

function CommentThreadItem({authenticated, comment, labels, locale, onCommentCreated, postId, referenceTime, returnTo, viewerScope}: {authenticated: boolean; comment: Comment; labels: SocialLabels; locale: Locale; onCommentCreated(comment: Comment): void; postId: string; referenceTime: number; returnTo: string; viewerScope?: string}) {
  const isReply = Boolean(comment.parentCommentId)
  const creatorLabel = comment.author.kind === 'ip' && comment.author.creator
    ? `${labels.createdBy} @${comment.author.creator.username}`
    : null
  const profileHref = comment.author.kind === 'ip' ? `/${locale}/profiles/${comment.author.id}` : null

  return <article className={`comment-thread-item${isReply ? ' comment-thread-item--reply' : ''}`} data-parent-comment-id={comment.parentCommentId ?? undefined}>
    {comment.author.kind === 'ip'
      ? <AuthorPreview author={comment.author} canMutate={authenticated && Boolean(viewerScope)} context="comment" labels={labels} locale={locale} returnTo={returnTo} {...(viewerScope ? {viewerScope} : {})}/>
      : <span aria-label={comment.author.displayName} className="comment-avatar" role="img">{comment.author.displayName.slice(0, 1)}</span>}
    <div className="comment-thread-content">
      <header className="comment-thread-heading">
        {profileHref ? <Link href={profileHref} title={comment.author.displayName}><strong>{comment.author.displayName}</strong></Link> : <strong title={comment.author.displayName}>{comment.author.displayName}</strong>}
        <time dateTime={comment.createdAt}>{formatRelativeDuration(comment.createdAt, locale, referenceTime)}</time>
      </header>
      {creatorLabel ? <span aria-label={creatorLabel} className="creator-attribution">{creatorLabel}</span> : null}
      <p className={comment.state === 'deleted' ? 'deleted-comment' : undefined}>{comment.state === 'deleted' ? labels.deletedComment : comment.body}</p>
      {comment.state === 'published' && !isReply ? <details className="reply-composer"><summary>{labels.reply}</summary><CommentComposer authenticated={authenticated && Boolean(viewerScope)} labels={labels} locale={locale} onCommentCreated={onCommentCreated} parentCommentId={comment.id} postId={postId} returnTo={returnTo} {...(viewerScope ? {viewerScope} : {})}/></details> : null}
    </div>
  </article>
}

export function PostDetailContent({result, locale, labels, moreHref, authenticated=false, authResolutionNeeded=false, returnTo, referenceTime=Date.now(), viewerScope: serverViewerScope}: {result: SocialApiResult<PostDetail>; locale: Locale; labels: SocialLabels; moreHref?: string | undefined;authenticated?:boolean; authResolutionNeeded?: boolean; returnTo?: string; referenceTime?: number; viewerScope?: string}) {
  const [canMutate, setCanMutate] = useState(authenticated)
  const [resolvedViewerScope, setResolvedViewerScope] = useState<string | undefined>(serverViewerScope)
  if (authenticated && resolvedViewerScope !== serverViewerScope) setResolvedViewerScope(serverViewerScope)
  const [checkingAccess, setCheckingAccess] = useState(!authenticated && authResolutionNeeded)
  const currentResult = result.status === 'ok' ? result.data : null
  const postReturnTo = currentResult ? returnTo ?? `/${locale}/posts/${currentResult.id}` : null
  const viewerScope = canMutate ? resolvedViewerScope : undefined
  const pageScope = currentResult ? `${viewerScope ?? 'anonymous'}\u0000${locale}\u0000${currentResult.id}\u0000${postReturnTo}` : null
  const currentServerItems = currentResult?.comments.items ?? null
  const serverItems = currentServerItems ?? []
  const [storedComments, setStoredComments] = useState<StoredComments>(() => ({scope: pageScope, comments: serverItems, localIds: [], serverItems: currentServerItems}))
  if (storedComments.scope !== pageScope) {
    setStoredComments({scope: pageScope, comments: serverItems, localIds: [], serverItems: currentServerItems})
  } else if (storedComments.serverItems !== currentServerItems) {
    setStoredComments(reconcileComments(storedComments, serverItems))
  }
  const comments = storedComments.scope === pageScope ? storedComments.comments : serverItems

  useEffect(() => {
    setCanMutate(authenticated)
    setResolvedViewerScope(serverViewerScope)
    if (authenticated || !authResolutionNeeded) {
      setCheckingAccess(false)
      return
    }
    const controller = new AbortController()
    setCheckingAccess(true)
    void fetch('/api/account', {cache: 'no-store', credentials: 'include', signal: controller.signal})
      .then(async (response) => {
        let accountResolved = false
        if (response.status === 200) {
          try {
          const account = await response.json()
          accountResolved = hasValidProfileId(account)
          if (accountResolved && !controller.signal.aborted) setResolvedViewerScope(account.profileId)
          } catch {
            accountResolved = false
          }
        }
        if (!controller.signal.aborted) setCanMutate(accountResolved)
      })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setCheckingAccess(false) })
    return () => controller.abort()
  }, [authResolutionNeeded, authenticated, serverViewerScope])

  function appendComment(comment: Comment) {
    if (!currentResult || !pageScope || comment.postId !== currentResult.id) return
    setStoredComments((current) => {
      const base = current.scope === pageScope ? current : {scope: pageScope, comments: serverItems, localIds: [], serverItems: currentResult.comments.items}
      if (base.comments.some((item) => item.id === comment.id)) return base
      return {...base, comments: [...base.comments, comment], localIds: [...base.localIds, comment.id]}
    })
  }

  if (result.status !== 'ok') return <div className="post-detail-content social-surface-state" data-social-surface-fill><ResultState labels={labels} result={result} /></div>
  const resolvedPostReturnTo = postReturnTo ?? `/${locale}/posts/${result.data.id}`
  return <div className="post-detail-content">
    <PostCard canMutate={canMutate} labels={labels} linked={false} locale={locale} post={result.data} referenceTime={referenceTime} returnTo={resolvedPostReturnTo} {...(viewerScope ? {viewerScope} : {})} />
    <section aria-label={labels.comments} className="comments-section">
      {checkingAccess ? <div aria-busy="true" aria-label={labels.comments} className="comment-auth-loading" role="status"><span/></div> : <CommentComposer authenticated={canMutate && Boolean(viewerScope)} labels={labels} locale={locale} onCommentCreated={appendComment} postId={result.data.id} returnTo={resolvedPostReturnTo} {...(viewerScope ? {viewerScope} : {})} />}
      <div className="comments-toolbar"><h2>{labels.comments}</h2><span>{labels.commentSortChronological ?? labels.comments}</span></div>
      {comments.length === 0 ? <div className="comments-empty"><h3>{labels.commentsEmptyTitle ?? labels.comments}</h3>{labels.commentsEmptyDescription ? <p>{labels.commentsEmptyDescription}</p> : null}</div> : null}
      <div className="comment-thread">{comments.map((comment) => <CommentThreadItem authenticated={canMutate} comment={comment} key={comment.id} labels={labels} locale={locale} onCommentCreated={appendComment} postId={result.data.id} referenceTime={referenceTime} returnTo={resolvedPostReturnTo} {...(viewerScope ? {viewerScope} : {})}/>)}</div>
      {result.data.comments.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}
    </section>
  </div>
}
