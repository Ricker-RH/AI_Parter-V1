"use client";

import type { FeedPost, PublicPostMedia } from "@aifans/contracts";
import Link from "next/link";
import type { Locale } from "../../i18n/config";
import { trackPostViewed } from "../../lib/analytics/events";
import { useAnalytics } from "../../lib/analytics/provider";
import {formatRelativeDuration} from '../../lib/relative-time'
import type { SocialLabels } from "./types";
import { PostActions } from "./PostActions";
import { AuthorPreview } from "./AuthorPreview";

function isPositiveNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function mediaGeometry(media: PublicPostMedia) {
  const width = media.width;
  const height = media.height;
  const aspectRatio = media.aspectRatio;
  const hasDimensions = isPositiveNumber(width) && isPositiveNumber(height);

  return {
    aspectRatio: hasDimensions
      ? width / height
      : isPositiveNumber(aspectRatio)
        ? aspectRatio
        : 4 / 5,
    height: hasDimensions ? height : undefined,
    width: hasDimensions ? width : undefined,
  };
}

export function PostCard({
  post,
  locale,
  labels,
  linked = true,
  returnTo,
  canMutate = false,
}: {
  post: FeedPost;
  locale: Locale;
  labels: SocialLabels;
  linked?: boolean;
  returnTo?: string;
  canMutate?: boolean;
}) {
  const analytics = useAnalytics();
  const mediaItems = post.media ?? [];
  const postHref = `/${locale}/posts/${post.id}`;
  const trackView = () => trackPostViewed(analytics, { locale, postId: post.id });
  const mediaRail = mediaItems.length ? (
    <div
      aria-label={labels.postMedia}
      className="post-media-rail"
      data-count={mediaItems.length}
      data-layout={mediaItems.length === 1 ? 'single' : 'rail'}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        event.currentTarget.scrollBy({
          behavior: 'smooth',
          left: direction * Math.max(event.currentTarget.clientWidth * 0.82, 240),
        });
      }}
      role="region"
      tabIndex={mediaItems.length > 1 ? 0 : undefined}
    >
      {mediaItems.map((media, index) => {
        const geometry = mediaGeometry(media);
        const image = <img
          alt={media.altText ?? `${post.author.displayName} ${index + 1}/${mediaItems.length}`}
          height={geometry.height}
          loading="lazy"
          src={media.url}
          width={geometry.width}
        />;
        const frameProps = {
          className: 'post-media-frame',
          style: {aspectRatio: geometry.aspectRatio},
        };

        return linked
          ? <Link {...frameProps} href={postHref} key={media.id} onClick={trackView}>{image}</Link>
          : <div {...frameProps} key={media.id}>{image}</div>;
      })}
    </div>
  ) : null;
  return (
    <article className="post-card">
      <div className="post-layout">
        <AuthorPreview author={post.author} canMutate={canMutate} labels={labels} locale={locale} returnTo={returnTo ?? `/${locale}`} {...(post.viewerFollowsAuthor === undefined ? {} : {followsAuthor: post.viewerFollowsAuthor})}/>
        <div className="post-content">
      <header className="post-author">
        <div className="post-author-line"><Link href={`/${locale}/profiles/${post.author.id}`}><strong>{post.author.displayName}</strong></Link><time dateTime={post.publishedAt}>{formatRelativeDuration(post.publishedAt, locale)}</time><span className="account-kind">{labels.aiAccount}</span></div>
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
      {mediaRail}
      <PostActions bookmarked={post.viewerHasBookmarked ?? false} canMutate={canMutate && post.viewerHasLiked !== undefined && post.viewerHasBookmarked !== undefined} commentCount={post.commentCount} labels={labels} liked={post.viewerHasLiked ?? false} likeCount={post.likeCount} locale={locale} postId={post.id} returnTo={returnTo ?? `/${locale}`}/>
        </div>
      </div>
    </article>
  );
}
