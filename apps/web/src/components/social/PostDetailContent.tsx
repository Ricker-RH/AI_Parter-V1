'use client'

import {AccountSchema, CommentThreadContextSchema, type PostDetail, type PublicComment} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {formatRelativeDuration} from '../../lib/relative-time'
import type {SocialApiResult} from '../../lib/social-api'
import {AuthorPreview} from './AuthorPreview'
import {CommentActions} from './CommentActions'
import {CommentComposer, type CommentViewer} from './CommentComposer'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

type CommentGroup = PostDetail['comments']['groups'][number]

type StoredComments = {
  contextGroups: CommentGroup[]
  groups: CommentGroup[]
  localComments: PublicComment[]
  optimisticCount: number
  scope: string | null
  serverCommentCount: number
  serverGroups: CommentGroup[] | null
}

type CommentAccess = {
  inputKey: string
  canMutate: boolean
  checkingAccess: boolean
  viewer?: CommentViewer
  viewerScope?: string
}

type ReplyTarget = {id: string; name: string}

function groupCommentIds(groups: CommentGroup[]): Set<string> {
  return new Set(groups.flatMap((group) => [group.root.id, ...group.replies.map((reply) => reply.id)]))
}

function insertComment(groups: CommentGroup[], comment: PublicComment): CommentGroup[] {
  if (comment.parentCommentId === null || comment.rootCommentId === comment.id) {
    return groups.some((group) => group.root.id === comment.id) ? groups : [...groups, {root: comment, replies: []}]
  }
  let inserted = false
  const next = groups.map((group) => {
    if (group.root.id !== comment.rootCommentId || group.replies.some((reply) => reply.id === comment.id)) return group
    inserted = true
    return {...group, replies: [...group.replies, comment]}
  })
  return inserted ? next : groups
}

function mergeLocalComments(groups: CommentGroup[], comments: PublicComment[]): CommentGroup[] {
  return comments.reduce(insertComment, groups)
}

function reconcileComments(current: StoredComments, serverGroups: CommentGroup[], serverCommentCount: number): StoredComments {
  const serverIds = groupCommentIds(serverGroups)
  const localComments = current.localComments.filter((comment) => !serverIds.has(comment.id))
  const acknowledgedCount = Math.max(0, serverCommentCount - current.serverCommentCount)
  const serverRootIds = new Set(serverGroups.map((group) => group.root.id))
  const contextGroups = current.contextGroups.filter((group) => !serverRootIds.has(group.root.id))
  return {...current, contextGroups, groups: mergeLocalComments([...serverGroups, ...contextGroups], localComments), localComments, optimisticCount: Math.max(0, current.optimisticCount - acknowledgedCount), serverCommentCount, serverGroups}
}

function CommentThreadItem({authenticated, comment, labels, locale, onReply, postId, referenceTime, returnTo, viewerScope}: {authenticated: boolean; comment: PublicComment; labels: SocialLabels; locale: Locale; onReply(target: ReplyTarget): void; postId: string; referenceTime: number; returnTo: string; viewerScope?: string}) {
  const isReply = comment.parentCommentId !== null
  const isTombstone = comment.state === 'deleted'
  const author = isTombstone ? null : comment.author
  const authorName = author?.displayName ?? labels.deletedComment
  const creatorLabel = author?.kind === 'ip' && author.creator ? `${labels.createdBy} @${author.creator.username}` : null
  const profileHref = author?.kind === 'ip' ? `/${locale}/profiles/${author.id}` : null
  return <article className={`comment-thread-item${isReply ? ' comment-thread-item--reply' : ''}`} data-parent-comment-id={comment.parentCommentId ?? undefined} id={`comment-${comment.id}`} tabIndex={-1}>
    <div className={`comment-avatar-rail${isTombstone ? ' comment-avatar-rail--tombstone' : ''}`}>
      {author?.kind === 'ip'
        ? <AuthorPreview author={author} canMutate={authenticated && Boolean(viewerScope)} context="comment" labels={labels} locale={locale} returnTo={returnTo} {...(viewerScope ? {viewerScope} : {})}/>
        : author ? <span aria-label={authorName} className="comment-avatar" role="img">{Array.from(author.displayName)[0]?.toLocaleUpperCase()}</span> : null}
    </div>
    <div className="comment-thread-content">
      <header className="comment-thread-heading">
        {author ? (profileHref ? <Link href={profileHref} title={authorName}><strong>{authorName}</strong></Link> : <strong title={authorName}>{authorName}</strong>) : null}
        <time dateTime={comment.createdAt}>{formatRelativeDuration(comment.createdAt, locale, referenceTime)}</time>
      </header>
      {creatorLabel ? <span aria-label={creatorLabel} className="creator-attribution">{creatorLabel}</span> : null}
      <p className={comment.state === 'deleted' ? 'deleted-comment' : undefined}>{comment.state === 'deleted' ? labels.deletedComment : comment.body}</p>
      {!isTombstone ? <CommentActions bookmarked={comment.viewerHasBookmarked ?? false} bookmarkCount={comment.bookmarkCount} canMutate={authenticated && Boolean(viewerScope) && comment.viewerHasLiked !== undefined && comment.viewerHasBookmarked !== undefined} commentId={comment.id} labels={labels} liked={comment.viewerHasLiked ?? false} likeCount={comment.likeCount} locale={locale} onReply={() => onReply({id: comment.id, name: authorName})} postId={postId} replyCount={comment.replyCount} returnTo={returnTo} shareCount={comment.shareCount} {...(viewerScope ? {viewerScope} : {})}/> : null}
    </div>
  </article>
}

function CommentThreadGroup({authenticated, group, labels, locale, onReply, postId, referenceTime, returnTo, viewerScope}: {authenticated: boolean; group: CommentGroup; labels: SocialLabels; locale: Locale; onReply(target: ReplyTarget): void; postId: string; referenceTime: number; returnTo: string; viewerScope?: string}) {
  return <section aria-label={group.root.state === 'deleted' ? labels.deletedComment : group.root.author?.displayName ?? labels.deletedComment} className={`comment-thread-group${group.replies.length ? ' comment-thread-group--connected' : ''}`}>
    <CommentThreadItem authenticated={authenticated} comment={group.root} labels={labels} locale={locale} onReply={onReply} postId={postId} referenceTime={referenceTime} returnTo={returnTo} {...(viewerScope ? {viewerScope} : {})}/>
    {group.replies.map((reply) => <CommentThreadItem authenticated={authenticated} comment={reply} key={reply.id} labels={labels} locale={locale} onReply={onReply} postId={postId} referenceTime={referenceTime} returnTo={returnTo} {...(viewerScope ? {viewerScope} : {})}/>)}
  </section>
}

export function PostDetailContent({result, locale, labels, moreHref, authenticated=false, accountResolutionNeeded=false, authResolutionNeeded=false, returnTo, referenceTime=Date.now(), viewer: serverViewer, viewerScope: serverViewerScope}: {result: SocialApiResult<PostDetail>; locale: Locale; labels: SocialLabels; moreHref?: string | undefined; authenticated?: boolean; accountResolutionNeeded?: boolean; authResolutionNeeded?: boolean; returnTo?: string; referenceTime?: number; viewer?: CommentViewer; viewerScope?: string}) {
  const resolutionNeeded = accountResolutionNeeded || authResolutionNeeded
  const accessInputKey = JSON.stringify([authenticated, resolutionNeeded, serverViewerScope ?? null, serverViewer?.displayName ?? null, serverViewer?.avatarUrl ?? null])
  const initialAccess = (): CommentAccess => ({inputKey: accessInputKey, canMutate: authenticated && !resolutionNeeded, checkingAccess: resolutionNeeded, ...(!resolutionNeeded && serverViewer ? {viewer: serverViewer} : {}), ...(!resolutionNeeded && serverViewerScope ? {viewerScope: serverViewerScope} : {})})
  const [storedAccess, setStoredAccess] = useState<CommentAccess>(initialAccess)
  const access = storedAccess.inputKey === accessInputKey ? storedAccess : initialAccess()
  if (storedAccess.inputKey !== accessInputKey) setStoredAccess(access)
  const {canMutate, checkingAccess, viewer: resolvedViewer, viewerScope: resolvedViewerScope} = access
  const currentResult = result.status === 'ok' ? result.data : null
  const postReturnTo = currentResult ? returnTo ?? `/${locale}/posts/${currentResult.id}` : null
  const viewerScope = canMutate ? resolvedViewerScope : undefined
  const pageScope = currentResult ? `${viewerScope ?? 'anonymous'}\u0000${locale}\u0000${currentResult.id}\u0000${postReturnTo}` : null
  const currentServerGroups = currentResult?.comments.groups ?? null
  const serverGroups = currentServerGroups ?? []
  const [storedComments, setStoredComments] = useState<StoredComments>(() => ({scope: pageScope, contextGroups: [], groups: serverGroups, localComments: [], optimisticCount: 0, serverCommentCount: currentResult?.commentCount ?? 0, serverGroups: currentServerGroups}))
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [anchorTarget, setAnchorTarget] = useState<string | null>(null)
  if (storedComments.scope !== pageScope) {
    setStoredComments({scope: pageScope, contextGroups: [], groups: serverGroups, localComments: [], optimisticCount: 0, serverCommentCount: currentResult?.commentCount ?? 0, serverGroups: currentServerGroups})
    if (replyTarget !== null) setReplyTarget(null)
  } else if (storedComments.serverGroups !== currentServerGroups) {
    setStoredComments(reconcileComments(storedComments, serverGroups, currentResult?.commentCount ?? 0))
  }
  const groups = storedComments.scope === pageScope ? storedComments.groups : serverGroups

  useEffect(() => {
    if (!resolutionNeeded) return
    const controller = new AbortController()
    void fetch('/api/me', {cache: 'no-store', credentials: 'include', signal: controller.signal}).then(async (response) => {
      let resolved: CommentAccess = {inputKey: accessInputKey, canMutate: false, checkingAccess: false}
      if (response.status === 200) {
        try {
          const parsed = AccountSchema.strict().safeParse(await response.json())
          if (parsed.success) resolved = {inputKey: accessInputKey, canMutate: true, checkingAccess: false, viewerScope: parsed.data.id, viewer: {displayName: parsed.data.displayName, avatarUrl: parsed.data.avatarUrl ?? null}}
        } catch {}
      }
      if (!controller.signal.aborted) setStoredAccess((current) => current.inputKey === accessInputKey ? resolved : current)
    }).catch(() => undefined).finally(() => { if (!controller.signal.aborted) setStoredAccess((current) => current.inputKey === accessInputKey ? {...current, checkingAccess: false} : current) })
    return () => controller.abort()
  }, [accessInputKey, resolutionNeeded])

  useEffect(() => {
    const readAnchor = () => {
      const match = window.location.hash.match(/^#comment-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)
      setAnchorTarget(match?.[1] ?? null)
    }
    readAnchor()
    window.addEventListener('hashchange', readAnchor)
    return () => window.removeEventListener('hashchange', readAnchor)
  }, [pageScope])

  useEffect(() => {
    if (!anchorTarget) return
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`comment-${anchorTarget}`)
      if (!target) return
      target.focus({preventScroll: true})
      target.scrollIntoView({behavior: 'smooth', block: 'center'})
    })
    return () => window.cancelAnimationFrame(frame)
  }, [anchorTarget, groups])

  useEffect(() => {
    if (!anchorTarget || !currentResult || !pageScope || document.getElementById(`comment-${anchorTarget}`)) return
    const controller = new AbortController()
    void fetch(`/api/social/posts/${currentResult.id}/comments/${anchorTarget}/context`, {cache: 'no-store', credentials: 'include', signal: controller.signal}).then(async (response) => {
      if (!response.ok || controller.signal.aborted) return
      const parsed = CommentThreadContextSchema.safeParse(await response.json())
      if (!parsed.success || controller.signal.aborted) return
      const {group} = parsed.data
      const members = [group.root, ...group.replies]
      if (group.root.postId !== currentResult.id || group.root.rootCommentId !== group.root.id || !members.some((comment) => comment.id === anchorTarget) || members.some((comment) => comment.postId !== currentResult.id || comment.rootCommentId !== group.root.id)) return
      setStoredComments((current) => {
        if (current.scope !== pageScope || groupCommentIds(current.groups).has(anchorTarget)) return current
        const contextGroups = [...current.contextGroups.filter((item) => item.root.id !== group.root.id), group]
        const groupsWithoutContextRoot = current.groups.filter((item) => item.root.id !== group.root.id)
        return {...current, contextGroups, groups: mergeLocalComments([...groupsWithoutContextRoot, group], current.localComments)}
      })
    }).catch(() => undefined)
    return () => controller.abort()
  }, [anchorTarget, currentResult, pageScope])

  function appendComment(comment: PublicComment) {
    if (!currentResult || !pageScope || comment.postId !== currentResult.id) return
    setStoredComments((current) => {
      const base: StoredComments = current.scope === pageScope ? current : {scope: pageScope, contextGroups: [], groups: serverGroups, localComments: [], optimisticCount: 0, serverCommentCount: currentResult.commentCount, serverGroups: currentServerGroups}
      if (groupCommentIds(base.groups).has(comment.id)) return base
      return {...base, groups: insertComment(base.groups, comment), localComments: [...base.localComments, comment], optimisticCount: base.optimisticCount + 1}
    })
    setReplyTarget((current) => current?.id === comment.parentCommentId ? null : current)
  }

  if (result.status !== 'ok') return <div className="post-detail-content social-surface-state" data-social-surface-fill><ResultState labels={labels} result={result}/></div>
  const resolvedPostReturnTo = postReturnTo ?? `/${locale}/posts/${result.data.id}`
  const replyingTo = replyTarget ? (labels.replyingTo ?? 'Replying to @{name}').replace('{name}', replyTarget.name) : null
  return <div aria-label={labels.comments} className="post-detail-scroll-region post-detail-content" role="region" tabIndex={0}>
    <PostCard canMutate={canMutate} commentCountOverride={result.data.commentCount + storedComments.optimisticCount} labels={labels} linked={false} locale={locale} post={result.data} referenceTime={referenceTime} returnTo={resolvedPostReturnTo} variant="detail" {...(viewerScope ? {viewerScope} : {})}/>
    <section className="comments-section">
      <div className="comments-toolbar"><h2>{labels.comments}</h2><span>{labels.commentSortChronological ?? labels.comments}</span></div>
      <div className="post-detail-composer-dock">
        {replyingTo ? <div className="comment-reply-target"><span>{replyingTo}</span><button aria-label={labels.cancelReply ?? 'Cancel reply'} onClick={() => setReplyTarget(null)} type="button">{labels.cancelReply ?? 'Cancel reply'}</button></div> : null}
        {checkingAccess ? <div aria-busy="true" aria-label={labels.comments} className="comment-auth-loading" role="status"><span/></div> : <CommentComposer authenticated={canMutate && Boolean(viewerScope)} labels={labels} locale={locale} onCommentCreated={appendComment} postId={result.data.id} returnTo={resolvedPostReturnTo} {...(replyTarget ? {parentCommentId: replyTarget.id} : {})} {...(resolvedViewer ? {viewer: resolvedViewer} : {})} {...(viewerScope ? {viewerScope} : {})}/>}
      </div>
      {groups.length === 0 ? <div className="comments-empty"><h3>{labels.commentsEmptyTitle ?? labels.comments}</h3>{labels.commentsEmptyDescription ? <p>{labels.commentsEmptyDescription}</p> : null}</div> : null}
      <div className="comment-thread">{groups.map((group) => <CommentThreadGroup authenticated={canMutate} group={group} key={group.root.id} labels={labels} locale={locale} onReply={setReplyTarget} postId={result.data.id} referenceTime={referenceTime} returnTo={resolvedPostReturnTo} {...(viewerScope ? {viewerScope} : {})}/>)}</div>
      {result.data.comments.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}
    </section>
  </div>
}
