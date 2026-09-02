import type {PostDetail} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {CommentComposer} from './CommentComposer'
import {formatRelativeDuration} from '../../lib/relative-time'

type Comment = PostDetail['comments']['items'][number]

function CommentThreadItem({authenticated, comment, labels, locale, postId, referenceTime, returnTo}: {authenticated: boolean; comment: Comment; labels: SocialLabels; locale: Locale; postId: string; referenceTime: number; returnTo: string}) {
  const isReply = Boolean(comment.parentCommentId)
  const creatorLabel = comment.author.kind === 'ip' && comment.author.creator
    ? `${labels.createdBy} @${comment.author.creator.username}`
    : null

  return <article className={`comment-thread-item${isReply ? ' comment-thread-item--reply' : ''}`} data-parent-comment-id={comment.parentCommentId ?? undefined}>
    <span aria-label={`${comment.author.displayName} avatar`} className="comment-avatar" role="img">{comment.author.displayName.slice(0, 1)}</span>
    <div className="comment-thread-content">
      <header className="comment-thread-heading">
        <strong title={comment.author.displayName}>{comment.author.displayName}</strong>
        <time dateTime={comment.createdAt}>{formatRelativeDuration(comment.createdAt, locale, referenceTime)}</time>
        <span className="account-kind">{comment.author.kind === 'ip' ? labels.aiAccount : labels.humanAccount}</span>
      </header>
      {creatorLabel ? <span aria-label={creatorLabel} className="creator-attribution">{creatorLabel}</span> : null}
      <p className={comment.state === 'deleted' ? 'deleted-comment' : undefined}>{comment.state === 'deleted' ? labels.deletedComment : comment.body}</p>
      {comment.state === 'published' && !isReply ? <details className="reply-composer"><summary>{labels.reply}</summary><CommentComposer authenticated={authenticated} labels={labels} locale={locale} parentCommentId={comment.id} postId={postId} returnTo={returnTo}/></details> : null}
    </div>
  </article>
}

export function PostDetailContent({result, locale, labels, moreHref, authenticated=false, returnTo, referenceTime=Date.now()}: {result: SocialApiResult<PostDetail>; locale: Locale; labels: SocialLabels; moreHref?: string | undefined;authenticated?:boolean; returnTo?: string; referenceTime?: number}) {
  if (result.status !== 'ok') return <ResultState labels={labels} result={result} />
  const postReturnTo = returnTo ?? `/${locale}/posts/${result.data.id}`
  return <div className="post-detail-content">
    <PostCard canMutate={authenticated} labels={labels} linked={false} locale={locale} post={result.data} referenceTime={referenceTime} returnTo={postReturnTo} />
    <section aria-label={labels.comments} className="comments-section">
      <CommentComposer authenticated={authenticated} labels={labels} locale={locale} postId={result.data.id} returnTo={postReturnTo} />
      {result.data.comments.items.length === 0 ? <div className="comments-empty"><h3>{labels.commentsEmptyTitle ?? labels.comments}</h3>{labels.commentsEmptyDescription ? <p>{labels.commentsEmptyDescription}</p> : null}</div> : null}
      <div className="comment-thread">{result.data.comments.items.map((comment) => <CommentThreadItem authenticated={authenticated} comment={comment} key={comment.id} labels={labels} locale={locale} postId={result.data.id} referenceTime={referenceTime} returnTo={postReturnTo}/>)}</div>
      {result.data.comments.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}
    </section>
  </div>
}
