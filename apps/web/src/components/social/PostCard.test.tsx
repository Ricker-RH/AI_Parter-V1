import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import {act} from "react";
import {hydrateRoot} from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  createdBy: "Created by",
  commentPlaceholder: "Write a comment", commentSubmit: "Comment", commentSending: "Posting", commentSuccess: "Posted", reply: "Reply",
  signInToComment: "Sign in to comment", markRead: "Mark as read", markingRead: "Marking", profileNotFoundTitle: "Profile not found",
  profileNotFoundDescription: "Not public", followers: "followers", posts: "Posts", signInToInteract: "Sign in to like, save, or follow",
  startChat: "Chat", startingChat: "Opening…", chatStartError: "Unable to start a conversation.",
  messages: "Messages", profile: "Profile", share: "Share",
  postMedia: "Post media",
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
const cardReferenceTime = Date.parse('2026-09-02T12:00:00.000Z');

function staticMediaFrames(count: 1 | 2 | 3 | 4) {
  const markup = renderToStaticMarkup(
    <PostCard
      linked={false}
      labels={labels}
      locale="en"
      post={{ ...post, media: post.media?.slice(0, count) }}
      referenceTime={cardReferenceTime}
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
  beforeEach(() => vi.useFakeTimers({now: new Date('2026-09-02T12:00:00.000Z')}));
  afterEach(() => vi.useRealTimers());

  it("uses one fixed-height media viewport regardless of source geometry", () => {
    const { container } = render(<PostCard linked={false} labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);

    const frames = staticMediaFrames(4);
    expect(frames).toHaveLength(4);
    expect([...frames].every((frame) => frame.classList.contains('post-media-frame'))).toBe(true);
    expect(screen.getByRole("img", { name: "Wide moon" })).toHaveAttribute("width", "1200");
    expect(screen.getByRole("img", { name: "Wide moon" })).toHaveAttribute("height", "800");
    expect(screen.getByRole("img", { name: "Contract ratio" })).not.toHaveAttribute("width");
    expect(screen.getByRole("img", { name: "Fallback ratio" })).toHaveAttribute("loading", "lazy");
  });

  it.each([
    [1, ["1.5"]],
    [2, ["1.5", "1.25"]],
    [3, ["1.5", "1.25", "0.8"]],
    [4, ["1.5", "1.25", "0.8", "1"]],
  ] as const)("keeps all %i images in one ordered media rail", (count, ratios) => {
    const { container } = render(
      <PostCard
        linked={false}
        labels={labels}
        locale="en"
        post={{ ...post, media: post.media?.slice(0, count) }}
        referenceTime={cardReferenceTime}
      />,
    );

    const rail = container.querySelector(".post-media-rail");
    expect(rail).toHaveAttribute("data-count", String(count));
    expect(rail).toHaveAttribute("data-layout", count === 1 ? "single" : "rail");
    const frames = staticMediaFrames(count);
    expect(frames).toHaveLength(count);
    expect(rail?.querySelectorAll("img")).toHaveLength(count);
    expect([...frames].map((frame) => frame.getAttribute("style"))).toEqual(
      ratios.map((ratio) => `aspect-ratio:${ratio}`),
    );
    expect([...frames].every((frame) => !frame.classList.contains("post-media-frame--featured"))).toBe(true);
  });

  it("shows compact relative time without an AI/IP badge", () => {
    const {container} = render(<PostCard linked={false} labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);

    expect(screen.getByText('2d')).toHaveAttribute('datetime', post.publishedAt);
    expect(container.querySelector('.author-meta')).toBeNull();
    expect(screen.getByRole('article')).not.toHaveTextContent('@luma');
    expect(container.querySelector('.post-author-line .account-kind')).toBeNull();
  });

  it("exposes a named keyboard carousel without nesting links and scrolls it with horizontal arrows", () => {
    const {container} = render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);
    const rail = screen.getByRole('region', {name: 'Post media'});
    const scrollBy = vi.fn();
    Object.defineProperties(rail, {
      clientWidth: {configurable: true, value: 400},
      scrollBy: {configurable: true, value: scrollBy},
    });

    expect(rail).toHaveAttribute('tabindex', '0');
    expect(within(rail).getAllByRole('link')).toHaveLength(4);
    expect(container.querySelector('.post-link .post-media-rail')).toBeNull();
    fireEvent.keyDown(rail, {key: 'ArrowRight'});
    fireEvent.keyDown(rail, {key: 'ArrowLeft'});
    expect(scrollBy).toHaveBeenNthCalledWith(1, {behavior: 'smooth', left: 328});
    expect(scrollBy).toHaveBeenNthCalledWith(2, {behavior: 'smooth', left: -328});
  });

  it("keeps detail media non-linked while retaining the keyboard-reachable rail", () => {
    render(<PostCard linked={false} labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);

    const rail = screen.getByRole('region', {name: 'Post media'});
    expect(within(rail).queryByRole('link')).toBeNull();
    expect(rail).toHaveAttribute('tabindex', '0');
  });

  it("hydrates with the server reference time even after crossing a minute boundary", async () => {
    const referenceTime = Date.parse('2026-09-02T12:00:00.000Z');
    const boundaryPost = {...post, media: undefined, publishedAt: '2026-09-02T11:59:01.000Z'};
    const view = <PostCard linked={false} labels={labels} locale="en" post={boundaryPost} referenceTime={referenceTime} />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(view);
    document.body.append(container);
    expect(container.querySelector('time')).toHaveTextContent('now');
    vi.setSystemTime(new Date('2026-09-02T12:01:01.000Z'));
    const hydrationErrors: unknown[] = [];

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, view, {onRecoverableError: (error) => hydrationErrors.push(error)});
    });

    expect(container.querySelector('time')).toHaveTextContent('now');
    expect(hydrationErrors).toHaveLength(0);
    await act(async () => root?.unmount());
    container.remove();
  });

  it("keeps long display names accessible without sacrificing timestamp metadata", () => {
    const displayName = 'LongUnbrokenDisplayName'.repeat(4);
    const {container} = render(<PostCard linked={false} labels={labels} locale="en" post={{...post, author: {...post.author, displayName}}} referenceTime={Date.parse('2026-09-02T12:00:00.000Z')} />);

    expect(screen.getByRole('link', {name: displayName})).toHaveAttribute('title', displayName);
    expect(container.querySelector('.post-author-line time')).toHaveTextContent('2d');
    expect(container.querySelector('.post-author-line .account-kind')).toBeNull();
  });
});

describe("PostCard public interaction hierarchy", () => {
  it("shows the same icon action row to guests and gates only protected actions", () => {
    render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} returnTo="/en" />);

    expect(screen.queryByText(labels.signInToInteract)).toBeNull();
    expect(screen.getByRole("link", {name: labels.like})).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen");
    expect(screen.getByRole("link", {name: labels.comments})).toHaveAttribute("href", `/en/posts/${post.id}`);
    expect(screen.getByRole("link", {name: labels.bookmark})).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen");
    expect(screen.getByRole("button", {name: labels.share!})).toBeVisible();
    expect(document.querySelectorAll(".post-action svg")).toHaveLength(4);
  });

  it("opens a real-data author preview and restores focus on Escape", () => {
    render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);
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
