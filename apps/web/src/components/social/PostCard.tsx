"use client";

import type { FeedPost } from "@aifans/contracts";
import Link from "next/link";
import {useRef, type MouseEvent} from 'react'
import type { Locale } from "../../i18n/config";
import { trackPostViewed } from "../../lib/analytics/events";
import { useAnalytics } from "../../lib/analytics/provider";
import {formatRelativeDuration} from '../../lib/relative-time'
import type { SocialLabels } from "./types";
import { PostActions } from "./PostActions";
import { AuthorPreview } from "./AuthorPreview";
import {PostMedia} from './PostMedia'

export function PostCard({
  post,
  locale,
  labels,
  linked = true,
  referenceTime,
  returnTo,
  canMutate = false,
}: {
  post: FeedPost;
  locale: Locale;
  labels: SocialLabels;
  linked?: boolean;
  referenceTime: number;
  returnTo?: string;
  canMutate?: boolean;
}) {
  const analytics = useAnalytics();
  const navigationTarget = useRef<HTMLAnchorElement>(null)
  const mediaItems = post.media ?? [];
  const postHref = `/${locale}/posts/${post.id}`;
  const trackView = () => trackPostViewed(analytics, { locale, postId: post.id });
  function openCard(event: MouseEvent<HTMLElement>) {
    if (!linked) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('a, button, input, textarea, select, summary, [role="button"], [role="link"], [contenteditable="true"]')) return
    navigationTarget.current?.click()
  }
  return (
    <article className="post-card" onClick={openCard}>
      {linked ? <Link aria-label={`${labels.posts}: ${post.author.displayName}`} className="post-card-navigation-target" href={postHref} onClick={trackView} ref={navigationTarget}/> : null}
      <div className="post-layout">
        <AuthorPreview author={post.author} canMutate={canMutate} labels={labels} locale={locale} returnTo={returnTo ?? `/${locale}`} {...(post.viewerFollowsAuthor === undefined ? {} : {followsAuthor: post.viewerFollowsAuthor})}/>
        <div className="post-content">
      <header className="post-author">
        <div className="post-author-line"><Link href={`/${locale}/profiles/${post.author.id}`} title={post.author.displayName}><strong>{post.author.displayName}</strong></Link><time dateTime={post.publishedAt}>{formatRelativeDuration(post.publishedAt, locale, referenceTime)}</time></div>
        {post.author.creator ? <span className="creator-attribution">{labels.createdBy} @{post.author.creator.username}</span> : null}
      </header>
      {linked && post.body ? (
        <Link
          aria-label={post.body}
          className="post-link"
          href={postHref}
          onClick={trackView}
        >
          <p className="post-body">{post.body}</p>
        </Link>
      ) : (
        post.body ? <p className="post-body">{post.body}</p> : null
      )}
      <PostMedia authorName={post.author.displayName} items={mediaItems} label={labels.postMedia} {...(linked ? {onPostOpen: trackView, postHref} : {})}/>
      <PostActions bookmarked={post.viewerHasBookmarked ?? false} canMutate={canMutate && post.viewerHasLiked !== undefined && post.viewerHasBookmarked !== undefined} commentCount={post.commentCount} labels={labels} liked={post.viewerHasLiked ?? false} likeCount={post.likeCount} locale={locale} postId={post.id} returnTo={returnTo ?? `/${locale}`}/>
        </div>
      </div>
    </article>
  );
}
