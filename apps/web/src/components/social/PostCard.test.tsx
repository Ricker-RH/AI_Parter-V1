import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn(), replace: vi.fn()})}));

const labels: SocialLabels = {
  aiAccount: "AI/IP", authRequiredTitle: "Sign in required", authRequiredDescription: "Sign in to see this page.",
  bookmark: "Bookmark", bookmarksEmptyTitle: "No bookmarks yet", bookmarksEmptyDescription: "Save posts for later.",
  commentCount: "{count} comments", comments: "Comments", deletedComment: "This comment was deleted.", follow: "Follow",
  followingAction: "Following", homeEmptyTitle: "Nothing here yet", homeEmptyDescription: "New posts appear here.",
  humanAccount: "Human", like: "Like", notificationComment: "commented on your post", notificationCommentLike: "liked your comment",
  notificationFollow: "followed you", notificationPostLike: "liked your post", notificationReply: "replied to your comment",
  notificationsEmptyTitle: "No notifications yet", notificationsEmptyDescription: "Updates appear here.", postNotFoundTitle: "Post not found",
  postNotFoundDescription: "It may have been removed.", removeBookmark: "Remove bookmark", unlike: "Unlike", unavailableTitle: "Unable to load",
  unavailableDescription: "Try again later.", unavailableRetry: "Retry", unavailableRetrying: "Retrying", interactionError: "Action failed. Try again.", loadMore: "Load more", aifansActor: "AIFANS",
  visualTypeFilter: "IP style", allTypes: "All", realistic: "Realistic", anime: "Anime", hybrid: "Hybrid", createdBy: "Created by",
  commentPlaceholder: "Write a comment", commentSubmit: "Comment", commentSending: "Posting", commentSuccess: "Posted", reply: "Reply",
  signInToComment: "Sign in to comment", markRead: "Mark as read", markingRead: "Marking", profileNotFoundTitle: "Profile not found",
  profileNotFoundDescription: "Not public", followers: "followers", posts: "Posts", signInToInteract: "Sign in to like, save, or follow",
  messages: "Messages", profile: "Profile", share: "Share",
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

function staticMediaFrames(count: 1 | 2 | 3 | 4) {
  const markup = renderToStaticMarkup(
    <PostCard
      linked={false}
      labels={labels}
      locale="en"
      post={{ ...post, media: post.media?.slice(0, count) }}
    />,
  );
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.querySelectorAll<HTMLElement>(".post-media-frame");
}

function requiredFrame(frames: NodeListOf<HTMLElement>, index: number) {
  const frame = frames.item(index);
  if (!frame) throw new Error(`Expected media frame at index ${index}`);
  return frame;
}

describe("PostCard media geometry", () => {
  it("uses dimensions, contract ratio, then 4:5 fallback for ordinary frames", () => {
    const { container } = render(<PostCard linked={false} labels={labels} locale="en" post={post} />);

    const frames = staticMediaFrames(4);
    expect(frames).toHaveLength(4);
    expect(requiredFrame(frames, 0).getAttribute("style")).toBe("aspect-ratio:1.5");
    expect(requiredFrame(frames, 1).getAttribute("style")).toBe("aspect-ratio:1.25");
    expect(requiredFrame(frames, 2).getAttribute("style")).toBe("aspect-ratio:0.8");
    expect(requiredFrame(frames, 3).getAttribute("style")).toBe("aspect-ratio:1");
    expect(screen.getByRole("img", { name: "Wide moon" })).toHaveAttribute("width", "1200");
    expect(screen.getByRole("img", { name: "Wide moon" })).toHaveAttribute("height", "800");
    expect(screen.getByRole("img", { name: "Contract ratio" })).not.toHaveAttribute("width");
    expect(screen.getByRole("img", { name: "Fallback ratio" })).toHaveAttribute("loading", "lazy");
  });

  it.each([
    [1, ["1.5"]],
    [2, ["1.5", "1.25"]],
    [4, ["1.5", "1.25", "0.8", "1"]],
  ] as const)("keeps the %i-image grid contract without a featured frame", (count, ratios) => {
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
    const frames = staticMediaFrames(count);
    expect(frames).toHaveLength(count);
    expect(grid?.querySelectorAll("img")).toHaveLength(count);
    expect([...frames].map((frame) => frame.getAttribute("style"))).toEqual(
      ratios.map((ratio) => `aspect-ratio:${ratio}`),
    );
    expect(
      [...frames].every(
        (frame) => !frame.classList.contains("post-media-frame--featured"),
      ),
    ).toBe(true);
  });

  it("lets only the three-image featured frame take its height from the spanned grid area", () => {
    const { container } = render(
      <PostCard
        linked={false}
        labels={labels}
        locale="en"
        post={{ ...post, media: post.media?.slice(0, 3) }}
      />,
    );

    const frames = staticMediaFrames(3);
    expect(requiredFrame(frames, 0).classList.contains("post-media-frame--featured")).toBe(
      true,
    );
    expect(requiredFrame(frames, 0).getAttribute("style")).toBeNull();
    expect(requiredFrame(frames, 1).classList.contains("post-media-frame--featured")).toBe(
      false,
    );
    expect(requiredFrame(frames, 2).classList.contains("post-media-frame--featured")).toBe(
      false,
    );
    expect(requiredFrame(frames, 1).getAttribute("style")).toBe("aspect-ratio:1.25");
    expect(requiredFrame(frames, 2).getAttribute("style")).toBe("aspect-ratio:0.8");
  });
});

describe("PostCard public interaction hierarchy", () => {
  it("shows the same icon action row to guests and gates only protected actions", () => {
    render(<PostCard labels={labels} locale="en" post={post} returnTo="/en?visualType=anime" />);

    expect(screen.queryByText(labels.signInToInteract)).toBeNull();
    expect(screen.getByRole("link", {name: labels.like})).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen%3FvisualType%3Danime");
    expect(screen.getByRole("link", {name: labels.comments})).toHaveAttribute("href", `/en/posts/${post.id}`);
    expect(screen.getByRole("link", {name: labels.bookmark})).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen%3FvisualType%3Danime");
    expect(screen.getByRole("button", {name: labels.share!})).toBeVisible();
    expect(document.querySelectorAll(".post-action svg")).toHaveLength(4);
  });

  it("opens a real-data author preview and restores focus on Escape", () => {
    render(<PostCard labels={labels} locale="en" post={post} />);
    const trigger = screen.getByRole("button", {name: "Profile: Luma"});

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {name: "Luma"});
    expect(dialog).toBeVisible();
    const profileLink = within(dialog).getByRole("link", {name: "Luma"});
    expect(profileLink).toHaveAttribute("href", `/en/profiles/${post.author.id}`);
    expect(screen.getByRole("link", {name: labels.follow})).toHaveAttribute("href", expect.stringContaining("/en/auth/sign-in"));
    fireEvent.keyDown(document, {key: "Tab", shiftKey: true});
    expect(within(dialog).getByRole("link", {name: labels.messages!})).toHaveFocus();
    fireEvent.keyDown(document, {key: "Tab"});
    expect(profileLink).toHaveFocus();
    fireEvent.keyDown(document, {key: "Escape"});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
