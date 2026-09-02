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

const profileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function hasValidProfileId(value: unknown): value is {profileId: string} {
  return typeof value === 'object'
    && value !== null
    && 'profileId' in value
    && typeof value.profileId === 'string'
    && profileIdPattern.test(value.profileId)
}

function CommentThreadItem({authenticated, comment, labels, locale, postId, referenceTime, returnTo}: {authenticated: boolean; comment: Comment; labels: SocialLabels; locale: Locale; postId: string; referenceTime: number; returnTo: string}) {
  const isReply = Boolean(comment.parentCommentId)
  const creatorLabel = comment.author.kind === 'ip' && comment.author.creator
    ? `${labels.createdBy} @${comment.author.creator.username}`
    : null
  const profileHref = comment.author.kind === 'ip' ? `/${locale}/profiles/${comment.author.id}` : null

  return <article className={`comment-thread-item${isReply ? ' comment-thread-item--reply' : ''}`} data-parent-comment-id={comment.parentCommentId ?? undefined}>
    {comment.author.kind === 'ip'
      ? <AuthorPreview author={comment.author} canMutate={authenticated} context="comment" labels={labels} locale={locale} returnTo={returnTo}/>
      : <span aria-label={comment.author.displayName} className="comment-avatar" role="img">{comment.author.displayName.slice(0, 1)}</span>}
    <div className="comment-thread-content">
      <header className="comment-thread-heading">
        {profileHref ? <Link href={profileHref} title={comment.author.displayName}><strong>{comment.author.displayName}</strong></Link> : <strong title={comment.author.displayName}>{comment.author.displayName}</strong>}
        <time dateTime={comment.createdAt}>{formatRelativeDuration(comment.createdAt, locale, referenceTime)}</time>
      </header>
      {creatorLabel ? <span aria-label={creatorLabel} className="creator-attribution">{creatorLabel}</span> : null}
      <p className={comment.state === 'deleted' ? 'deleted-comment' : undefined}>{comment.state === 'deleted' ? labels.deletedComment : comment.body}</p>
      {comment.state === 'published' && !isReply ? <details className="reply-composer"><summary>{labels.reply}</summary><CommentComposer authenticated={authenticated} labels={labels} locale={locale} parentCommentId={comment.id} postId={postId} returnTo={returnTo}/></details> : null}
    </div>
  </article>
}

export function PostDetailContent({result, locale, labels, moreHref, authenticated=false, authResolutionNeeded=false, returnTo, referenceTime=Date.now()}: {result: SocialApiResult<PostDetail>; locale: Locale; labels: SocialLabels; moreHref?: string | undefined;authenticated?:boolean; authResolutionNeeded?: boolean; returnTo?: string; referenceTime?: number}) {
  const [canMutate, setCanMutate] = useState(authenticated)
  const [checkingAccess, setCheckingAccess] = useState(!authenticated && authResolutionNeeded)

  useEffect(() => {
    setCanMutate(authenticated)
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
            accountResolved = hasValidProfileId(await response.json())
          } catch {
            accountResolved = false
          }
        }
        if (!controller.signal.aborted) setCanMutate(accountResolved)
      })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setCheckingAccess(false) })
    return () => controller.abort()
  }, [authResolutionNeeded, authenticated])

  if (result.status !== 'ok') return <div aria-label={labels.posts} className="post-detail-content" role="region" tabIndex={0}><ResultState labels={labels} result={result} /></div>
  const postReturnTo = returnTo ?? `/${locale}/posts/${result.data.id}`
  return <div aria-label={labels.posts} className="post-detail-content" role="region" tabIndex={0}>
    <PostCard canMutate={canMutate} labels={labels} linked={false} locale={locale} post={result.data} referenceTime={referenceTime} returnTo={postReturnTo} />
    <section aria-label={labels.comments} className="comments-section">
      {checkingAccess ? <div aria-busy="true" aria-label={labels.comments} className="comment-auth-loading" role="status"><span/></div> : <CommentComposer authenticated={canMutate} labels={labels} locale={locale} postId={result.data.id} returnTo={postReturnTo} />}
      <div className="comments-toolbar"><h2>{labels.comments}</h2><span>{labels.commentSortChronological ?? labels.comments}</span></div>
      {result.data.comments.items.length === 0 ? <div className="comments-empty"><h3>{labels.commentsEmptyTitle ?? labels.comments}</h3>{labels.commentsEmptyDescription ? <p>{labels.commentsEmptyDescription}</p> : null}</div> : null}
      <div className="comment-thread">{result.data.comments.items.map((comment) => <CommentThreadItem authenticated={canMutate} comment={comment} key={comment.id} labels={labels} locale={locale} postId={result.data.id} referenceTime={referenceTime} returnTo={postReturnTo}/>)}</div>
      {result.data.comments.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}
    </section>
  </div>
}
