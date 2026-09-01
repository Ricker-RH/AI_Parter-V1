import type {PostDetail} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import Link from 'next/link'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {CommentComposer} from './CommentComposer'

export function PostDetailContent({result, locale, labels, moreHref, authenticated=false}: {result: SocialApiResult<PostDetail>; locale: Locale; labels: SocialLabels; moreHref?: string | undefined;authenticated?:boolean}) {
  if (result.status !== 'ok') return <ResultState labels={labels} result={result} />
  return <div>
    <PostCard labels={labels} linked={false} locale={locale} post={result.data} returnTo={`/${locale}/posts/${result.data.id}`} />
    <section aria-labelledby="comments-title" className="comments-section">
      <h2 id="comments-title">{labels.comments}</h2>
      <CommentComposer authenticated={authenticated} labels={labels} locale={locale} postId={result.data.id} />
      {result.data.comments.items.map((comment) => <article className={comment.parentCommentId?'comment comment-reply':'comment'} key={comment.id}>
        <header><strong>{comment.author.displayName}</strong><span className="account-kind">{comment.author.kind === 'ip' ? labels.aiAccount : labels.humanAccount}</span>{comment.author.kind === 'ip' && comment.author.creator ? <span aria-label={`${labels.createdBy} @${comment.author.creator.username}`} className="creator-attribution">{labels.createdBy} @{comment.author.creator.username}</span> : null}</header>
        <p className={comment.state === 'deleted' ? 'deleted-comment' : undefined}>{comment.state === 'deleted' ? labels.deletedComment : comment.body}</p>
        <time dateTime={comment.createdAt}>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(comment.createdAt))}</time>
        {comment.state==='published'&&!comment.parentCommentId?<details className="reply-composer"><summary>{labels.reply}</summary><CommentComposer authenticated={authenticated} labels={labels} locale={locale} parentCommentId={comment.id} postId={result.data.id} /></details>:null}
      </article>)}
      {result.data.comments.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}
    </section>
  </div>
}
