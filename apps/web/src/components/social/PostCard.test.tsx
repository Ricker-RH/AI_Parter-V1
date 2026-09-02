import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import {act} from "react";
import {hydrateRoot} from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPost } from "@aifans/contracts";
import { PostCard } from "./PostCard.js";
import type { SocialLabels } from "./types.js";

const {capture, routerPrefetch} = vi.hoisted(() => ({capture: vi.fn(), routerPrefetch: vi.fn()}));

vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; prefetch?: boolean | null }) => (
    <a {...props} data-prefetch={prefetch === false ? 'false' : 'shell'}>{children}</a>
  ),
}));

vi.mock("../../lib/analytics/provider.js", () => ({
  useAnalytics: () => ({ capture, identify: vi.fn(), page: vi.fn(), reset: vi.fn() }),
}));
vi.mock("next/navigation", () => ({useRouter: () => ({prefetch: routerPrefetch, push: vi.fn(), refresh: vi.fn(), replace: vi.fn()})}));

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
  messages: "Messages", profile: "Profile", share: "Share", close: "Close",
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
  return template.content.querySelectorAll<HTMLElement>('[data-testid="post-media-frame"]');
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
    expect([...frames].every((frame) => frame.dataset.testid === 'post-media-frame')).toBe(true);
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

    const rail = container.querySelector('[data-testid="post-media-rail"]');
    expect(rail).toHaveAttribute("data-count", String(count));
    expect(rail).toHaveAttribute("data-layout", count === 1 ? "single" : "rail");
    const frames = staticMediaFrames(count);
    expect(frames).toHaveLength(count);
    expect(rail?.querySelectorAll("img")).toHaveLength(count);
    expect([...frames].map((frame) => frame.style.getPropertyValue('--post-media-ratio'))).toEqual(
      ratios,
    );
    expect([...frames].every((frame) => frame.dataset.testid === 'post-media-frame')).toBe(true);
  });

  it("shows compact relative time without an AI/IP badge", () => {
    const {container} = render(<PostCard linked={false} labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);

    expect(screen.getByText('2d')).toHaveAttribute('datetime', post.publishedAt);
    expect(container.querySelector('.author-meta')).toBeNull();
    expect(screen.getByRole('article')).not.toHaveTextContent('@luma');
    expect(container.querySelector('.post-author-line .account-kind')).toBeNull();
  });

  it('never overlays a plus follow control on a content avatar', () => {
    const {container} = render(<PostCard linked={false} canMutate labels={labels} locale="en" post={{...post, viewerFollowsAuthor: false}} referenceTime={cardReferenceTime} />)

    expect(container.querySelector('.profile-follow--avatar')).toBeNull()
    expect(container.querySelector('.post-avatar-trigger + .profile-follow')).toBeNull()
  })

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
    expect(container.querySelector('.post-link [data-testid="post-media-rail"]')).toBeNull();
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
  beforeEach(() => {capture.mockClear(); routerPrefetch.mockClear()});

  it('defers post and profile prefetches until pointer, keyboard, or touch intent and de-duplicates URLs', () => {
    const {container} = render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime}/>);
    const article = screen.getByRole('article');
    const cardContent = container.querySelector('.post-content');
    const postLink = screen.getByRole('link', {name: post.body});
    const profileLink = screen.getByRole('link', {name: 'Luma'});
    const mediaLink = screen.getByRole('img', {name: 'Wide moon'}).closest('a');

    expect(routerPrefetch).not.toHaveBeenCalled();
    expect(container.querySelector('.post-card-navigation-target')).toHaveAttribute('data-prefetch', 'false');
    expect(postLink).toHaveAttribute('data-prefetch', 'false');
    expect(profileLink).toHaveAttribute('data-prefetch', 'false');
    expect(mediaLink).toHaveAttribute('data-prefetch', 'false');

    fireEvent.pointerEnter(cardContent!);
    fireEvent.touchStart(cardContent!);
    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenLastCalledWith(`/en/posts/${post.id}`, expect.any(Object));

    fireEvent.pointerEnter(postLink);
    fireEvent.focus(postLink);
    fireEvent.touchStart(postLink);
    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenLastCalledWith(`/en/posts/${post.id}`, expect.any(Object));

    fireEvent.focus(profileLink);
    fireEvent.touchStart(profileLink);
    expect(routerPrefetch).toHaveBeenCalledTimes(2);
    expect(routerPrefetch).toHaveBeenLastCalledWith(`/en/profiles/${post.author.id}`, expect.any(Object));
  });

  it('shares intent prefetches across cards and retries after Next invalidates a URL', () => {
    const author = {...post.author, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
    const first = {...post, author, id: '88888888-8888-4888-8888-888888888888'};
    const second = {...post, author, id: '99999999-9999-4999-8999-999999999999'};
    render(<><PostCard labels={labels} locale="en" post={first} referenceTime={cardReferenceTime}/><PostCard labels={labels} locale="en" post={second} referenceTime={cardReferenceTime}/></>);
    const profileLinks = screen.getAllByRole('link', {name: 'Luma'});

    fireEvent.focus(profileLinks[0]!);
    fireEvent.touchStart(profileLinks[1]!);
    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenLastCalledWith(`/en/profiles/${author.id}`, expect.any(Object));

    const options = routerPrefetch.mock.calls[0]?.[1] as {onInvalidate?: () => void};
    expect(options.onInvalidate).toEqual(expect.any(Function));
    options.onInvalidate?.();
    fireEvent.pointerEnter(profileLinks[1]!);
    expect(routerPrefetch).toHaveBeenCalledTimes(2);
  });

  it('prefetches a whole-card navigation target when its keyboard-focusable overlay shows intent', () => {
    const cardPost = {...post, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'};
    render(<PostCard labels={labels} locale="en" post={cardPost} referenceTime={cardReferenceTime}/>);
    const overlay = screen.getByRole('link', {name: `${labels.posts}: ${post.author.displayName}`});

    expect(overlay).toHaveAttribute('data-prefetch', 'false');
    fireEvent.focus(overlay);
    fireEvent.touchStart(overlay);
    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenLastCalledWith(`/en/posts/${cardPost.id}`, expect.any(Object));
  });

  it('opens linked post details from body, media, and non-interactive card space exactly once', () => {
    const {container} = render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime}/>);
    const article = screen.getByRole('article');
    const navigationTarget = container.querySelector<HTMLAnchorElement>('.post-card-navigation-target')!
    const open = vi.spyOn(navigationTarget, 'click')

    fireEvent.click(container.querySelector('.post-content')!);
    expect(navigationTarget).toHaveAttribute('href', `/en/posts/${post.id}`)
    expect(open).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledTimes(1);

    open.mockClear(); capture.mockClear();
    fireEvent.click(screen.getByRole('link', {name: post.body}));
    expect(open).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledTimes(1);

    open.mockClear(); capture.mockClear();
    fireEvent.click(within(article).getByRole('img', {name: 'Wide moon'}));
    expect(open).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledTimes(1);

    open.mockClear(); capture.mockClear();
    fireEvent.click(navigationTarget)
    expect(capture).toHaveBeenCalledTimes(1)
  });

  it('leaves avatar, profile, and action controls independent and never nests interactive elements', () => {
    const {container} = render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime}/>);

    fireEvent.click(screen.getByRole('button', {name: 'Profile: Luma'}));
    fireEvent.keyDown(document, {key: 'Escape'});
    fireEvent.click(screen.getByRole('link', {name: 'Luma'}));
    fireEvent.click(screen.getByRole('link', {name: labels.like}));

    expect(container.querySelector('.post-card-navigation-target')).toHaveAttribute('href', `/en/posts/${post.id}`)
    expect(capture).not.toHaveBeenCalled();
    expect(container.querySelector('a a, a button, button a, button button')).toBeNull();
  });

  it('does not add whole-card navigation to a detail card', () => {
    const {container} = render(<PostCard linked={false} labels={labels} locale="en" post={post} referenceTime={cardReferenceTime}/>);
    fireEvent.click(container.querySelector('.post-content')!);
    expect(container.querySelector('.post-card-navigation-target')).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

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
    const profileLinks = within(dialog).getAllByRole("link");
    expect(profileLinks).toHaveLength(3);
    expect(profileLinks.filter((link) => link.getAttribute('href') === `/en/profiles/${post.author.id}`)).toHaveLength(2);
    const profileLink = within(dialog).getByRole("link", {name: "Luma"});
    expect(screen.getByRole("link", {name: labels.follow})).toHaveAttribute("href", expect.stringContaining("/en/auth/sign-in"));
    expect(within(dialog).queryByRole("link", {name: labels.startChat!})).toBeNull();
    expect(within(dialog).queryByRole("button", {name: labels.startChat!})).toBeNull();
    fireEvent.keyDown(document, {key: "Tab", shiftKey: true});
    expect(within(dialog).getByRole("button", {name: labels.close!})).toHaveFocus();
    fireEvent.keyDown(document, {key: "Tab"});
    expect(profileLink).toHaveFocus();
    fireEvent.keyDown(document, {key: "Escape"});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps a delayed profile request alive until follower data resolves", async () => {
    let resolveProfile!: (response: Response) => void;
    const request = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveProfile = resolve; }));
    vi.stubGlobal("fetch", request);
    render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);

    fireEvent.click(screen.getByRole("button", {name: "Profile: Luma"}));
    await act(async () => undefined);

    const signal = request.mock.calls[0]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    await act(async () => resolveProfile(Response.json({profile: post.author, followerCount: 12, posts: {items: [], nextCursor: null}})));
    expect(await screen.findByText("12 followers")).toBeVisible();
  });

  it("discards an old author profile response after the card author changes", async () => {
    const nextAuthor = {...post.author, id: "77777777-7777-4777-8777-777777777777", username: "nova", displayName: "Nova"};
    let resolveLuma!: (response: Response) => void;
    let resolveNova!: (response: Response) => void;
    const request = vi.fn((url: string) => new Promise<Response>((resolve) => {
      if (url.includes(post.author.id)) resolveLuma = resolve;
      else resolveNova = resolve;
    }));
    vi.stubGlobal("fetch", request);
    const {rerender} = render(<PostCard labels={labels} locale="en" post={post} referenceTime={cardReferenceTime} />);
    fireEvent.click(screen.getByRole("button", {name: "Profile: Luma"}));
    rerender(<PostCard labels={labels} locale="en" post={{...post, author: nextAuthor}} referenceTime={cardReferenceTime} />);
    await act(async () => resolveNova(Response.json({profile: nextAuthor, followerCount: 2, posts: {items: [], nextCursor: null}})));
    expect(await screen.findByText("2 followers")).toBeVisible();
    await act(async () => resolveLuma(Response.json({profile: post.author, followerCount: 99, posts: {items: [], nextCursor: null}})));
    expect(screen.getByText("2 followers")).toBeVisible();
    expect(screen.queryByText("99 followers")).toBeNull();
  });

  it("resets a local relationship override when the card author changes", async () => {
    const nextAuthor = {...post.author, id: "77777777-7777-4777-8777-777777777777", username: "nova", displayName: "Nova"};
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status: 204})));
    const {rerender} = render(<PostCard canMutate labels={labels} locale="en" post={{...post, viewerFollowsAuthor: false}} referenceTime={cardReferenceTime} />);
    fireEvent.click(screen.getByRole("button", {name: "Profile: Luma"}));
    fireEvent.click(screen.getByRole("button", {name: "Follow"}));
    expect(await screen.findByRole("button", {name: "Following"})).toBeVisible();
    rerender(<PostCard canMutate labels={labels} locale="en" post={{...post, author: nextAuthor, viewerFollowsAuthor: false}} referenceTime={cardReferenceTime} />);
    expect(screen.getByRole("dialog", {name: "Nova"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Follow"})).toBeVisible();
  });

  it("pulls pending modal focus back inside and exposes a localized close action", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>(() => undefined)));
    render(<PostCard canMutate labels={labels} locale="en" post={{...post, viewerFollowsAuthor: false}} referenceTime={cardReferenceTime} />);
    fireEvent.click(screen.getByRole("button", {name: "Profile: Luma"}));
    const dialog = screen.getByRole("dialog", {name: "Luma"});
    expect(within(dialog).getByRole("button", {name: "Close"})).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", {name: "Follow"}));
    document.body.tabIndex = -1;
    document.body.focus();
    fireEvent.keyDown(document, {key: "Tab"});
    expect(within(dialog).getByRole("link", {name: "Luma"})).toHaveFocus();
    document.body.focus();
    fireEvent.keyDown(document, {key: "Tab", shiftKey: true});
    expect(within(dialog).getByRole("button", {name: "Close"})).toHaveFocus();
  });
});
