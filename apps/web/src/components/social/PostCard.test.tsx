import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FeedPost } from "@aifans/contracts";
import { PostCard } from "./PostCard.js";
import type { SocialLabels } from "./types.js";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("../../lib/analytics/provider.js", () => ({
  useAnalytics: () => ({ capture: vi.fn(), identify: vi.fn(), page: vi.fn(), reset: vi.fn() }),
}));

const labels: SocialLabels = {
  aiAccount: "AI/IP", authRequiredTitle: "Sign in required", authRequiredDescription: "Sign in to see this page.",
  bookmark: "Bookmark", bookmarksEmptyTitle: "No bookmarks yet", bookmarksEmptyDescription: "Save posts for later.",
  commentCount: "{count} comments", comments: "Comments", deletedComment: "This comment was deleted.", follow: "Follow",
  followingAction: "Following", homeEmptyTitle: "Nothing here yet", homeEmptyDescription: "New posts appear here.",
  humanAccount: "Human", like: "Like", notificationComment: "commented on your post", notificationCommentLike: "liked your comment",
  notificationFollow: "followed you", notificationPostLike: "liked your post", notificationReply: "replied to your comment",
  notificationsEmptyTitle: "No notifications yet", notificationsEmptyDescription: "Updates appear here.", postNotFoundTitle: "Post not found",
  postNotFoundDescription: "It may have been removed.", removeBookmark: "Remove bookmark", unlike: "Unlike", unavailableTitle: "Unable to load",
  unavailableDescription: "Try again later.", interactionError: "Action failed. Try again.", loadMore: "Load more", aifansActor: "AIFANS",
  visualTypeFilter: "IP style", allTypes: "All", realistic: "Realistic", anime: "Anime", hybrid: "Hybrid", createdBy: "Created by",
  commentPlaceholder: "Write a comment", commentSubmit: "Comment", commentSending: "Posting", commentSuccess: "Posted", reply: "Reply",
  signInToComment: "Sign in to comment", markRead: "Mark as read", markingRead: "Marking", profileNotFoundTitle: "Profile not found",
  profileNotFoundDescription: "Not public", followers: "followers", posts: "Posts", signInToInteract: "Sign in to like, save, or follow",
};

const post: FeedPost = {
  id: "22222222-2222-4222-8222-222222222222", body: "A real post", languageCode: "en", publishedAt: "2026-08-31T12:00:00.000Z",
  author: { kind: "ip", id: "11111111-1111-4111-8111-111111111111", username: "luma", displayName: "Luma", languages: ["en"], visualType: "anime" },
  likeCount: 4, commentCount: 2,
  media: [
    { id: "33333333-3333-4333-8333-333333333333", type: "image", url: "https://media.example/one.webp", altText: "Wide moon", width: 1200, height: 800, aspectRatio: null },
    { id: "44444444-4444-4444-8444-444444444444", type: "image", url: "https://media.example/two.webp", altText: "Contract ratio", width: null, height: null, aspectRatio: 1.25 },
    { id: "55555555-5555-4555-8555-555555555555", type: "image", url: "https://media.example/three.webp", altText: "Fallback ratio", width: null, height: null, aspectRatio: null },
    { id: "66666666-6666-4666-8666-666666666666", type: "image", url: "https://media.example/four.webp", altText: "Square ratio", width: 800, height: 800, aspectRatio: 1 },
  ],
};

describe("PostCard media geometry", () => {
  it("wraps every image in a stable frame and uses dimensions, contract ratio, then 4:5 fallback", () => {
    const { container } = render(<PostCard linked={false} labels={labels} locale="en" post={{ ...post, media: post.media?.slice(0, 3) }} />);

    const frames = container.querySelectorAll(".post-media-frame");
    expect(frames).toHaveLength(3);
    expect(frames[0]).toHaveStyle({ aspectRatio: "1.5" });
    expect(frames[1]).toHaveStyle({ aspectRatio: "1.25" });
    expect(frames[2]).toHaveStyle({ aspectRatio: "0.8" });
    expect(screen.getByRole("img", { name: "Wide moon" })).toHaveAttribute("width", "1200");
    expect(screen.getByRole("img", { name: "Wide moon" })).toHaveAttribute("height", "800");
    expect(screen.getByRole("img", { name: "Contract ratio" })).not.toHaveAttribute("width");
    expect(screen.getByRole("img", { name: "Fallback ratio" })).toHaveAttribute("loading", "lazy");
  });

  it.each([1, 2, 3, 4] as const)("keeps the %i-image grid contract", (count) => {
    const { container } = render(
      <PostCard
        linked={false}
        labels={labels}
        locale="en"
        post={{ ...post, media: post.media?.slice(0, count) }}
      />,
    );

    const grid = container.querySelector(".post-media-grid");
    expect(grid).toHaveAttribute("data-count", String(count));
    expect(grid?.querySelectorAll(".post-media-frame")).toHaveLength(count);
    expect(grid?.querySelectorAll("img")).toHaveLength(count);
  });

  it("marks the first frame as featured only in a three-image grid", () => {
    const { container } = render(
      <PostCard
        linked={false}
        labels={labels}
        locale="en"
        post={{ ...post, media: post.media?.slice(0, 3) }}
      />,
    );

    const frames = container.querySelectorAll(".post-media-frame");
    expect(frames[0]).toHaveClass("post-media-frame--featured");
    expect(frames[1]).not.toHaveClass("post-media-frame--featured");
    expect(frames[2]).not.toHaveClass("post-media-frame--featured");
  });
});
