"use client";

import type { FeedPost, PublicPostMedia } from "@aifans/contracts";
import Link from "next/link";
import type { Locale } from "../../i18n/config";
import { trackPostViewed } from "../../lib/analytics/events";
import { useAnalytics } from "../../lib/analytics/provider";
import type { SocialLabels } from "./types";
import { PostActions } from "./PostActions";
import { AuthorPreview } from "./AuthorPreview";

function publishedTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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
  const isThreeImageGrid = post.media?.length === 3;
  const body = (
    <>
      {post.body ? <p className="post-body">{post.body}</p> : null}
      {post.media?.length ? (
        <div className="post-media-grid" data-count={post.media.length}>
          {post.media.map((media, index) => {
            const geometry = mediaGeometry(media);
            const isFeatured = isThreeImageGrid && index === 0;

            return (
              <div
                className={
                  isFeatured
                    ? "post-media-frame post-media-frame--featured"
                    : "post-media-frame"
                }
                key={media.id}
                style={isFeatured ? undefined : { aspectRatio: geometry.aspectRatio }}
              >
                <img
                  alt={media.altText ?? ""}
                  height={geometry.height}
                  loading="lazy"
                  src={media.url}
                  width={geometry.width}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
  return (
    <article className="post-card">
      <div className="post-layout">
        <AuthorPreview author={post.author} canMutate={canMutate} labels={labels} locale={locale} returnTo={returnTo ?? `/${locale}`} {...(post.viewerFollowsAuthor === undefined ? {} : {followsAuthor: post.viewerFollowsAuthor})}/>
        <div className="post-content">
      <header className="post-author">
        <div className="post-author-line"><Link href={`/${locale}/profiles/${post.author.id}`}><strong>{post.author.displayName}</strong></Link><time dateTime={post.publishedAt}>{publishedTime(post.publishedAt, locale)}</time></div>
        <span className="author-meta">@{post.author.username} · <span className="account-kind">{labels.aiAccount}</span></span>
        {post.author.creator ? <span className="creator-attribution">{labels.createdBy} @{post.author.creator.username}</span> : null}
      </header>
      {linked ? (
        <Link
          aria-label={post.body || post.author.displayName}
          className="post-link"
          href={`/${locale}/posts/${post.id}`}
          onClick={() =>
            trackPostViewed(analytics, { locale, postId: post.id })
          }
        >
          {body}
        </Link>
      ) : (
        body
      )}
      <PostActions bookmarked={post.viewerHasBookmarked ?? false} canMutate={canMutate && post.viewerHasLiked !== undefined && post.viewerHasBookmarked !== undefined} commentCount={post.commentCount} labels={labels} liked={post.viewerHasLiked ?? false} likeCount={post.likeCount} locale={locale} postId={post.id} returnTo={returnTo ?? `/${locale}`}/>
        </div>
      </div>
    </article>
  );
}
