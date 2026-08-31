import type {PostDetail} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

export function PostDetailContent({result, locale, labels, apiBaseUrl}: {result: SocialApiResult<PostDetail>; locale: Locale; labels: SocialLabels; apiBaseUrl?: string | undefined}) {
  if (result.status !== 'ok') return <ResultState labels={labels} result={result} />
  return <div>
    <PostCard apiBaseUrl={apiBaseUrl} labels={labels} linked={false} locale={locale} post={result.data} />
    <section aria-labelledby="comments-title" className="comments-section">
      <h2 id="comments-title">{labels.comments}</h2>
      {result.data.comments.items.map((comment) => <article className="comment" key={comment.id}>
        <header><strong>{comment.author.displayName}</strong><span className="account-kind">{comment.author.kind === 'ip' ? labels.aiAccount : labels.humanAccount}</span></header>
        <p className={comment.state === 'deleted' ? 'deleted-comment' : undefined}>{comment.state === 'deleted' ? labels.deletedComment : comment.body}</p>
        <time dateTime={comment.createdAt}>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(comment.createdAt))}</time>
      </article>)}
    </section>
  </div>
}
