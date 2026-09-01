"use client";

import type { FeedPost, PublicPostMedia } from "@aifans/contracts";
import Link from "next/link";
import type { Locale } from "../../i18n/config";
import { trackPostViewed } from "../../lib/analytics/events";
import { useAnalytics } from "../../lib/analytics/provider";
import type { SocialLabels } from "./types";
import { PostActions } from "./PostActions";

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
}: {
  post: FeedPost;
  locale: Locale;
  labels: SocialLabels;
  linked?: boolean;
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
      <header className="post-author">
        <div className="avatar" aria-hidden="true">
          {post.author.displayName.slice(0, 1)}
        </div>
        <div>
          <Link href={`/${locale}/profiles/${post.author.id}`}>
            <strong>{post.author.displayName}</strong>
          </Link>
          <span className="author-meta">
            @{post.author.username} ·{" "}
            <span className="account-kind">{labels.aiAccount}</span>
          </span>
          {post.author.creator ? (
            <span className="creator-attribution">
              {labels.createdBy} @{post.author.creator.username}
            </span>
          ) : null}
        </div>
        <time dateTime={post.publishedAt}>
          {publishedTime(post.publishedAt, locale)}
        </time>
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
      <footer
        className="post-stats"
        aria-label={`${post.likeCount} ${labels.like}, ${post.commentCount} ${labels.comments}`}
      >
        <span aria-label={post.viewerHasLiked ? labels.unlike : labels.like}>
          {post.likeCount} {labels.like}
        </span>
        <span>
          {post.commentCount} {labels.comments}
        </span>
        {post.viewerHasBookmarked === true ? (
          <span>{labels.removeBookmark}</span>
        ) : null}
        {post.viewerFollowsAuthor === true ? (
          <span>{labels.followingAction}</span>
        ) : null}
      </footer>
      {post.viewerHasLiked !== undefined &&
      post.viewerHasBookmarked !== undefined &&
      post.viewerFollowsAuthor !== undefined ? (
        <PostActions
          authorId={post.author.id}
          bookmarked={post.viewerHasBookmarked}
          followsAuthor={post.viewerFollowsAuthor}
          labels={labels}
          liked={post.viewerHasLiked}
          postId={post.id}
        />
      ) : (
        <Link className="interaction-login" href={`/${locale}/auth/sign-in`}>
          {labels.signInToInteract}
        </Link>
      )}
    </article>
  );
}
