'use client'

import type {FeedPost} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import {trackPostViewed} from '../../lib/analytics/events'
import {useAnalytics} from '../../lib/analytics/provider'
import type {SocialLabels} from './types'
import {PostActions} from './PostActions'

function publishedTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value))
}

export function PostCard({post, locale, labels, linked = true}: {post: FeedPost; locale: Locale; labels: SocialLabels; linked?: boolean}) {
  const analytics = useAnalytics()
  const body = <p className="post-body">{post.body}</p>
  return <article className="post-card">
    <header className="post-author">
      <div className="avatar" aria-hidden="true">{post.author.displayName.slice(0, 1)}</div>
      <div><strong>{post.author.displayName}</strong><span className="author-meta">@{post.author.username} · <span className="account-kind">{labels.aiAccount}</span></span></div>
      <time dateTime={post.publishedAt}>{publishedTime(post.publishedAt, locale)}</time>
    </header>
    {linked ? <Link aria-label={post.body || post.author.displayName} className="post-link" href={`/${locale}/posts/${post.id}`} onClick={() => trackPostViewed(analytics, {locale, postId: post.id})}>{body}</Link> : body}
    <footer className="post-stats" aria-label={`${post.likeCount} ${labels.like}, ${post.commentCount} ${labels.comments}`}>
      <span aria-label={post.viewerHasLiked ? labels.unlike : labels.like}>{post.likeCount} {labels.like}</span>
      <span>{post.commentCount} {labels.comments}</span>
      {post.viewerHasBookmarked === true ? <span>{labels.removeBookmark}</span> : null}
      {post.viewerFollowsAuthor === true ? <span>{labels.followingAction}</span> : null}
    </footer>
    {post.viewerHasLiked !== undefined && post.viewerHasBookmarked !== undefined && post.viewerFollowsAuthor !== undefined
      ? <PostActions authorId={post.author.id} bookmarked={post.viewerHasBookmarked} followsAuthor={post.viewerFollowsAuthor} labels={labels} liked={post.viewerHasLiked} postId={post.id} />
      : null}
  </article>
}
