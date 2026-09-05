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
import {useIntentPrefetch} from './useIntentPrefetch'

const interactiveTargetSelector = 'a, button, input, textarea, select, summary, [role="button"], [role="link"], [contenteditable="true"]'

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(interactiveTargetSelector) !== null
}

export function PostCard({
  post,
  locale,
  labels,
  linked = true,
  commentCountOverride,
  referenceTime,
  returnTo,
  canMutate = false,
  variant = 'feed',
  viewerScope,
}: {
  post: FeedPost;
  locale: Locale;
  labels: SocialLabels;
  linked?: boolean;
  commentCountOverride?: number;
  referenceTime: number;
  returnTo?: string;
  canMutate?: boolean;
  variant?: 'feed' | 'detail';
  viewerScope?: string;
}) {
  const analytics = useAnalytics();
  const navigationTarget = useRef<HTMLAnchorElement>(null)
  const {intentHandlers, prefetch} = useIntentPrefetch()
  const mediaItems = post.media ?? [];
  const postHref = `/${locale}/posts/${post.id}`;
  const trackView = () => trackPostViewed(analytics, { locale, postId: post.id });
  const creatorLabel = post.author.creator ? `${labels.createdBy} @${post.author.creator.username}` : null
  function openCard(event: MouseEvent<HTMLElement>) {
    if (!linked) return
    if (isInteractiveTarget(event.target)) return
    navigationTarget.current?.click()
  }
  return (
    <article className={`post-card${variant === 'detail' ? ' post-card--detail' : ''}`} onClick={openCard} {...(linked ? {
      onPointerEnter: (event) => { if (!isInteractiveTarget(event.target)) prefetch(postHref) },
      onTouchStart: (event) => { if (!isInteractiveTarget(event.target)) prefetch(postHref) },
    } : {})}>
      {linked ? <Link aria-label={`${labels.posts}: ${post.author.displayName}`} className="post-card-navigation-target" href={postHref} onClick={trackView} prefetch={false} ref={navigationTarget} {...intentHandlers(postHref)}/> : null}
      {variant === 'detail' ? <><div className="post-detail-post-header">
        <AuthorPreview author={post.author} canMutate={canMutate && Boolean(viewerScope)} labels={labels} locale={locale} returnTo={returnTo ?? `/${locale}`} {...(viewerScope ? {viewerScope} : {})} {...(post.viewerFollowsAuthor === undefined ? {} : {followsAuthor: post.viewerFollowsAuthor})}/>
        <header className="post-author">
        <div className="post-author-line"><Link {...intentHandlers(`/${locale}/profiles/${post.author.id}`)} href={`/${locale}/profiles/${post.author.id}`} prefetch={false} title={post.author.displayName}><strong>{post.author.displayName}</strong></Link><time dateTime={post.publishedAt}>{formatRelativeDuration(post.publishedAt, locale, referenceTime)}</time></div>
      </header>
      </div><div className="post-detail-post-content">
      {creatorLabel ? <span className="creator-attribution">{creatorLabel}</span> : null}
      {linked && post.body ? (
        <Link
          aria-label={post.body}
          className="post-link"
          href={postHref}
          onClick={trackView}
          prefetch={false}
          {...intentHandlers(postHref)}
        >
          <p className="post-body">{post.body}</p>
        </Link>
      ) : (
        post.body ? <p className="post-body">{post.body}</p> : null
      )}
      <PostMedia authorName={post.author.displayName} items={mediaItems} label={labels.postMedia} {...(linked ? {onPostIntent: () => prefetch(postHref), onPostOpen: trackView, postHref} : {})}/>
      <PostActions sharePreview={{title: post.author.displayName, body: post.body ?? ''}} bookmarked={post.viewerHasBookmarked ?? false} bookmarkCount={post.bookmarkCount} canMutate={canMutate && Boolean(viewerScope) && post.viewerHasLiked !== undefined && post.viewerHasBookmarked !== undefined} commentCount={commentCountOverride ?? post.commentCount} labels={labels} liked={post.viewerHasLiked ?? false} likeCount={post.likeCount} locale={locale} postId={post.id} returnTo={returnTo ?? `/${locale}`} shareCount={post.shareCount} variant={variant} {...(viewerScope ? {viewerScope} : {})}/>
      </div></> : <div className="post-layout">
        <AuthorPreview author={post.author} canMutate={canMutate && Boolean(viewerScope)} labels={labels} locale={locale} returnTo={returnTo ?? `/${locale}`} {...(viewerScope ? {viewerScope} : {})} {...(post.viewerFollowsAuthor === undefined ? {} : {followsAuthor: post.viewerFollowsAuthor})}/>
        <div className="post-content">
      <header className="post-author">
        <div className="post-author-line"><Link {...intentHandlers(`/${locale}/profiles/${post.author.id}`)} href={`/${locale}/profiles/${post.author.id}`} prefetch={false} title={post.author.displayName}><strong>{post.author.displayName}</strong></Link><time dateTime={post.publishedAt}>{formatRelativeDuration(post.publishedAt, locale, referenceTime)}</time></div>
        {creatorLabel ? <span className="creator-attribution">{creatorLabel}</span> : null}
      </header>
      {linked && post.body ? (
        <Link
          aria-label={post.body}
          className="post-link"
          href={postHref}
          onClick={trackView}
          prefetch={false}
          {...intentHandlers(postHref)}
        >
          <p className="post-body">{post.body}</p>
        </Link>
      ) : (
        post.body ? <p className="post-body">{post.body}</p> : null
      )}
      <PostMedia authorName={post.author.displayName} items={mediaItems} label={labels.postMedia} {...(linked ? {onPostIntent: () => prefetch(postHref), onPostOpen: trackView, postHref} : {})}/>
      <PostActions sharePreview={{title: post.author.displayName, body: post.body ?? ''}} bookmarked={post.viewerHasBookmarked ?? false} bookmarkCount={post.bookmarkCount} canMutate={canMutate && Boolean(viewerScope) && post.viewerHasLiked !== undefined && post.viewerHasBookmarked !== undefined} commentCount={commentCountOverride ?? post.commentCount} labels={labels} liked={post.viewerHasLiked ?? false} likeCount={post.likeCount} locale={locale} postId={post.id} returnTo={returnTo ?? `/${locale}`} shareCount={post.shareCount} variant={variant} {...(viewerScope ? {viewerScope} : {})}/>
        </div>
      </div>}
    </article>
  );
}
