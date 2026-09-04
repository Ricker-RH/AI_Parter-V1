import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {flushSync} from "react-dom";
import {createRoot} from "react-dom/client";
import {readFileSync} from "node:fs";
import type { AnchorHTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Account, FeedPage, Notification, PostDetail, PublicComment } from "@aifans/contracts";
import {CurrentAccountProvider, publishAccountUpdate} from "../account/CurrentAccountProvider.js";
import { FeedContent } from "./FeedContent.js";
import { NotificationsContent } from "./NotificationsContent.js";
import { PostDetailContent } from "./PostDetailContent.js";
import { PublicProfileContent } from "./PublicProfileContent.js";
import type { SocialLabels } from "./types.js";

const {routerRefresh} = vi.hoisted(() => ({routerRefresh: vi.fn()}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        (onClick as MouseEventHandler<HTMLAnchorElement> | undefined)?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

const analyticsCapture = vi.fn();
vi.mock("../../lib/analytics/provider.js", () => ({
  useAnalytics: () => ({
    capture: analyticsCapture,
    identify: vi.fn(),
    page: vi.fn(),
    reset: vi.fn(),
  }),
}));

const labels: SocialLabels = {
  aiAccount: "AI/IP",
  authRequiredTitle: "Sign in required",
  authRequiredDescription: "Sign in to see this page.",
  bookmark: "Bookmark",
  bookmarksEmptyTitle: "No bookmarks yet",
  bookmarksEmptyDescription: "Save posts for later.",
  commentCount: "{count} comments",
  comments: "Comments",
  commentSortChronological: "Chronological",
  deletedComment: "This comment was deleted.",
  follow: "Follow",
  followingAction: "Following",
  startChat: "Chat",
  startingChat: "Opening…",
  chatStartError: "Unable to start a conversation.",
  homeEmptyTitle: "Nothing here yet",
  homeEmptyDescription: "New posts appear here.",
  humanAccount: "Human",
  like: "Like",
  notificationComment: "commented on your post",
  notificationCommentLike: "liked your comment",
  notificationFollow: "followed you",
  notificationPostLike: "liked your post",
  notificationReply: "replied to your comment",
  notificationsEmptyTitle: "No notifications yet",
  notificationsEmptyDescription: "Updates appear here.",
  postNotFoundTitle: "Post not found",
  postNotFoundDescription: "It may have been removed.",
  removeBookmark: "Remove bookmark",
  unlike: "Unlike",
  unavailableTitle: "Unable to load",
  unavailableDescription: "Try again later.",
  unavailableRetry: "Retry",
  unavailableRetrying: "Retrying…",
  interactionError: "Action failed. Try again.",
  loadMore: "Load more",
  aifansActor: "AIFANS",
  createdBy: "Created by",
  commentPlaceholder: "Write a comment",
  commentSubmit: "Comment",
  commentSending: "Posting",
  commentSuccess: "Posted",
  reply: "Reply",
  signInToComment: "Sign in to comment",
  markRead: "Mark as read",
  markingRead: "Marking",
  profileNotFoundTitle: "Profile not found",
  profileNotFoundDescription: "Not public",
  followers: "followers",
  posts: "Posts",
  postMedia: "Post media",
  signInToInteract: "Sign in to like, save, or follow",
};
const ip = {
  kind: "ip" as const,
  id: "11111111-1111-4111-8111-111111111111",
  username: "luma",
  displayName: "Luma",
  languages: ["en" as const],
  visualType: "anime" as const,
  creator: {
    id: "77777777-7777-4777-8777-777777777777",
    username: "luma_creator",
    displayName: "Luma Creator",
  },
};
type FeedPagePost = FeedPage['items'][number];

const post: FeedPagePost = {
  id: "22222222-2222-4222-8222-222222222222",
  body: "A real post",
  languageCode: "en",
  publishedAt: "2026-08-31T12:00:00.000Z",
  author: ip,
  likeCount: 4,
  commentCount: 2,
  bookmarkCount: 1,
  shareCount: 3,
  viewerHasLiked: true,
  viewerHasBookmarked: false,
  viewerFollowsAuthor: false,
};
const viewerAccount: Account = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "human" as const,
  username: "rui",
  displayName: "Rui",
  avatarUrl: "https://media.example/rui.webp",
  preferredLocale: "en" as const,
  creatorModeEnabled: false,
  profileVersion: 1,
  background: {type: "color", colorKey: "paper"},
};

function testComment(overrides: Partial<PublicComment> & Pick<PublicComment, "id" | "parentCommentId" | "author">): PublicComment {
  const rootCommentId = overrides.rootCommentId ?? overrides.id;
  return {postId: post.id, rootCommentId, state: "published", createdAt: "2026-08-31T12:05:00.000Z", likeCount: 0, replyCount: 0, bookmarkCount: 0, shareCount: 0, viewerHasLiked: false, viewerHasBookmarked: false, ...overrides};
}

function rootGroups(comments: PublicComment[]): PostDetail["comments"]["groups"] {
  return comments.map((root) => ({root, replies: []}));
}

describe("real social content", () => {
  it("leaves feed scrolling to the shared surface but makes detail content the single named scroll region", () => {
    const {container, rerender} = render(
      <FeedContent
        labels={labels}
        locale="en"
        result={{ status: "ok", data: { items: [post], nextCursor: null } }}
      />,
    );
    expect(container.querySelector(".feed-list")).not.toHaveAttribute("tabindex");
    expect(container.querySelector(".feed-list")).not.toHaveAttribute("role");

    rerender(
      <PostDetailContent
        labels={labels}
        locale="en"
        result={{status: "ok", data: {...post, comments: {groups: [], nextCursor: null}}}}
      />,
    );
    const detailRegion = container.querySelector(".post-detail-scroll-region.post-detail-content");
    expect(detailRegion).toHaveAttribute("tabindex", "0");
    expect(detailRegion).toHaveAttribute("role", "region");
    expect(detailRegion).toHaveAttribute("aria-label", "Comments");
  });

  it("marks unavailable feed and detail states as the only fill-height surface content", () => {
    const {container, rerender} = render(
      <PostDetailContent
        labels={labels}
        locale="en"
        result={{status: "unavailable"}}
      />,
    );
    expect(container.querySelector(".post-detail-content")).toHaveAttribute("data-social-surface-fill");
    expect(container.querySelector(".post-detail-content")).toContainElement(screen.getByRole("alert"));
    expect(container.querySelector('.post-detail-composer-dock')).toBeNull();

    rerender(<FeedContent labels={labels} locale="en" result={{status: "unavailable"}} />);
    expect(container.firstElementChild).toHaveAttribute("data-social-surface-fill");
  });

  it("renders API post fields and preserves the locale in the detail URL", () => {
    render(
      <FeedContent
        labels={labels}
        locale="zh-CN"
        moreHref="/zh-CN?cursor=opaque"
        result={{ status: "ok", data: { items: [post], nextCursor: "opaque" } }}
      />,
    );
    expect(screen.getByRole("article")).toHaveTextContent("Luma");
    expect(screen.getByRole("article")).toHaveTextContent("A real post");
    expect(screen.getByRole("article")).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: /A real post/ })).toHaveAttribute(
      "href",
      `/zh-CN/posts/${post.id}`,
    );
    expect(screen.queryByText("AI/IP")).toBeNull();
    expect(
      screen.getAllByText("Created by @luma_creator").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Anime")).toBeNull();
    expect(screen.queryByText("Realistic")).toBeNull();
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      "/zh-CN?cursor=opaque",
    );
  });

  it("uses a detail-only post structure that keeps identity together and aligns post content to the detail edge", () => {
    const detail: PostDetail = {...post, media: [
      {id: "33333333-3333-4333-8333-333333333333", type: "image", url: "https://media.example/one.webp", altText: "First detail image", width: 1200, height: 800, aspectRatio: null},
      {id: "44444444-4444-4444-8444-444444444444", type: "image", url: "https://media.example/two.webp", altText: "Second detail image", width: 800, height: 1200, aspectRatio: null},
    ], comments: {groups: [], nextCursor: null}}
    const {container, rerender} = render(<PostDetailContent labels={labels} locale="en" referenceTime={Date.parse("2026-08-31T12:10:00.000Z")} result={{status: "ok", data: detail}} />)

    const detailCard = container.querySelector('.post-card--detail')
    expect(detailCard).not.toBeNull()
    expect(detailCard?.querySelector('.post-detail-post-header > .author-preview')).not.toBeNull()
    expect(detailCard?.querySelector('.post-detail-post-header > .post-author')).not.toBeNull()
    expect(detailCard?.querySelector('.post-detail-post-content > .post-body')).toHaveTextContent(post.body)
    expect(detailCard?.querySelector('.post-detail-post-content > [data-testid="post-media-rail"]')).toHaveAttribute('data-count', '2')
    expect(detailCard?.querySelector('.post-detail-post-content > .post-actions')).not.toBeNull()
    expect(detailCard?.querySelector('.post-layout')).toBeNull()
    expect(screen.getByRole('button', {name: 'Profile: Luma'})).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.getByRole('region', {name: labels.postMedia})).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('link', {name: 'Like 4'})).toBeVisible()

    rerender(<PostDetailContent labels={labels} locale="en" result={{status: "ok", data: {...detail, media: [], comments: {groups: [], nextCursor: null}}}} />)
    expect(container.querySelector('.post-card--detail [data-testid="post-media-rail"]')).toBeNull()
    expect(container.querySelector('.post-card--detail .post-detail-post-content > .post-actions')).not.toBeNull()
  });

  it("captures a post-view intent from the real feed link without its body", () => {
    render(
      <FeedContent
        labels={labels}
        locale="en"
        result={{ status: "ok", data: { items: [post], nextCursor: null } }}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: /A real post/ }));
    expect(analyticsCapture).toHaveBeenCalledWith({
      name: "post_viewed",
      properties: { event_version: 1, locale: "en", post_id: post.id },
    });
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain(
      post.body,
    );
  });

  it("renders safe ordered post images with accessible alternative text", () => {
    const mediaPost: FeedPagePost = {
      ...post,
      media: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          type: "image",
          url: "https://media.example/public/posts/one.webp",
          altText: "Luma under moonlight",
          width: 1200,
          height: 800,
          aspectRatio: 1.5,
        },
        {
          id: "99999999-9999-4999-8999-999999999999",
          type: "image",
          url: "https://media.example/public/posts/two.png",
          altText: null,
          width: 800,
          height: 800,
          aspectRatio: 1,
        },
      ],
    };
    const { container } = render(
      <FeedContent
        labels={labels}
        locale="en"
        result={{
          status: "ok",
          data: { items: [mediaPost], nextCursor: null },
        }}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Luma under moonlight" }),
    ).toHaveAttribute("src", mediaPost.media?.[0]?.url);
    expect(container.querySelector(".post-media-rail")).toHaveAttribute(
      "data-count",
      "2",
    );
    expect(container.querySelector(".post-media-rail")).toHaveAttribute("data-layout", "rail");
    expect(container.querySelectorAll(".post-media-rail img")).toHaveLength(2);
  });

  it("shows anonymous users the real action row and gates protected actions", () => {
    const anonymous = {...post, viewerHasLiked: false, viewerHasBookmarked: false, viewerFollowsAuthor: false};
    render(
      <FeedContent
        canMutate={false}
        labels={labels}
        locale="en"
        result={{
          status: "ok",
          data: { items: [anonymous], nextCursor: null },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Like 4" })).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen");
    expect(screen.getByRole("link", { name: "Bookmark 1" })).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen");
    expect(screen.getByRole("link", { name: "Comments 2" })).toHaveAttribute("href", `/en/posts/${post.id}`);
    expect(screen.queryByRole("button", {name: "Like 4"})).toBeNull();
  });

  it("keeps authenticated false relationship values interactive", () => {
    const signedIn = {...post, viewerHasLiked: false, viewerHasBookmarked: false, viewerFollowsAuthor: false};
    render(<FeedContent canMutate labels={labels} locale="en" result={{status: "ok", data: {items: [signedIn], nextCursor: null}}} viewerScope="viewer-a" />);

    expect(screen.getByRole("button", {name: "Like 4"})).toBeEnabled();
  });

  it("renders localized empty, authentication, and unavailable states without posts", () => {
    const { rerender } = render(
      <FeedContent
        labels={labels}
        locale="en"
        result={{ status: "ok", data: { items: [], nextCursor: null } }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Nothing here yet" }),
    ).toBeVisible();
    rerender(
      <FeedContent
        labels={labels}
        locale="en"
        result={{ status: "auth-required" }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Sign in required" }),
    ).toBeVisible();
    rerender(
      <FeedContent
        labels={labels}
        locale="en"
        result={{ status: "unavailable" }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Unable to load" }),
    ).toBeVisible();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("allows another unavailable retry after a refresh keeps the result mounted", () => {
    routerRefresh.mockReset();
    render(<FeedContent labels={labels} locale="en" result={{status: "unavailable"}} />);

    fireEvent.click(screen.getByRole("button", {name: "Retry"}));

    expect(routerRefresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", {name: "Retry"})).toBeEnabled();

    fireEvent.click(screen.getByRole("button", {name: "Retry"}));
    expect(routerRefresh).toHaveBeenCalledTimes(2);
  });

  it("does not render ordinary-user visual type filters", () => {
    render(
      <FeedContent
        labels={labels}
        locale="zh-CN"
        result={{ status: "ok", data: { items: [], nextCursor: null } }}
      />,
    );
    expect(screen.queryByRole("tab", { name: "All" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Realistic" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Hybrid" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Nothing here yet" }),
    ).toBeVisible();
  });

  it("distinguishes human comments and removes author identity and actions from deleted tombstones", () => {
    const humanComment = testComment({id: "33333333-3333-4333-8333-333333333333", parentCommentId: null, body: "Human reply", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    const deletedComment = testComment({id: "55555555-5555-4555-8555-555555555555", parentCommentId: null, state: "deleted", createdAt: "2026-08-31T12:06:00.000Z", author: {...ip, creator: {...ip.creator, username: "comment_creator"}}});
    const detail: PostDetail = {
      ...post,
      comments: {groups: rootGroups([humanComment, deletedComment]), nextCursor: "comments-next"},
    };
    const { container, rerender } = render(
      <PostDetailContent
        labels={labels}
        locale="en"
        moreHref={`/en/posts/${post.id}?commentCursor=comments-next`}
        referenceTime={Date.parse("2026-08-31T12:10:00.000Z")}
        result={{ status: "ok", data: detail }}
      />,
    );
    expect(screen.queryByText("Human")).toBeNull();
    expect(screen.queryByText("AI/IP")).toBeNull();
    expect(screen.getByText("Human reply")).toBeVisible();
    expect(screen.getByText("This comment was deleted.")).toBeVisible();
    expect(screen.queryByText("Created by @comment_creator")).toBeNull();
    expect(screen.getByRole("button", {name: "Profile: Alex"})).toHaveTextContent("A");
    expect(screen.getByText("5m")).toHaveAttribute("datetime", "2026-08-31T12:05:00.000Z");
    expect(screen.getByRole("heading", {name: "Comments"})).toBeVisible();
    expect(screen.getByText('Chronological')).toBeVisible();
    expect(document.querySelectorAll(".comment-thread-item")).toHaveLength(2);
    const commentRows = container.querySelectorAll<HTMLElement>(".comment-thread-item");
    expect(commentRows[0]).toHaveAttribute("id", `comment-${humanComment.id}`);
    expect(commentRows[0]).toHaveAttribute("tabindex", "-1");
    expect(commentRows[1]).toHaveAttribute("id", `comment-${deletedComment.id}`);
    expect(commentRows[1]?.querySelector('.comment-avatar')).toBeNull();
    expect(commentRows[1]?.querySelector('.comment-actions')).toBeNull();
    expect(within(commentRows[0]!).getByRole("link", {name: "Alex"})).toHaveAttribute('href', '/en/humans/44444444-4444-4444-8444-444444444444');
    expect(within(commentRows[0]!).getByRole("button", {name: "Profile: Alex"})).toBeVisible();
    expect(within(commentRows[1]!).queryByRole("link", {name: "Luma"})).toBeNull();
    expect(within(commentRows[1]!).queryByRole("button", {name: "Profile: Luma"})).toBeNull();
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      `/en/posts/${post.id}?commentCursor=comments-next`,
    );
    rerender(
      <PostDetailContent
        labels={{ ...labels, createdBy: "创建者" }}
        locale="zh-CN"
        result={{ status: "ok", data: detail }}
      />,
    );
    expect(screen.queryByText("创建者 @comment_creator")).toBeNull();
    expect(screen.getByRole("button", {name: "个人主页: Alex"})).toHaveTextContent("A");
    expect(screen.queryByLabelText(/avatar/i)).toBeNull();
  });

  it("renders replies as a flat connected group and keeps the exact parent action", () => {
    const parentId = "33333333-3333-4333-8333-333333333333";
    const parent = testComment({id: parentId, parentCommentId: null, body: "Parent", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}, replyCount: 1});
    const reply = testComment({id: "55555555-5555-4555-8555-555555555555", rootCommentId: parentId, parentCommentId: parentId, body: "Nested reply", createdAt: "2026-08-31T12:06:00.000Z", author: ip});
    const detail: PostDetail = {
      ...post,
      comments: {groups: [{root: parent, replies: [reply]}], nextCursor: null},
    };
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" referenceTime={Date.parse("2026-08-31T12:10:00.000Z")} result={{status: "ok", data: detail}} viewerScope="viewer-a" />);

    expect(container.querySelector(".comment-thread-item--reply")).toHaveTextContent("Nested reply");
    expect(container.querySelector(".comment-thread-item--reply")).toHaveAttribute("data-parent-comment-id", parentId);
    expect(within(container.querySelector(".comment-thread-item--reply")!).getByRole("button", {name: "Reply 0"})).toBeVisible();
  });

  it("publishes reply and composer feedback state on the detail scroll region", async () => {
    const comment = testComment({id: "33333333-3333-4333-8333-333333333333", parentCommentId: null, body: "Parent", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    const detail: PostDetail = {...post, comments: {groups: rootGroups([comment]), nextCursor: null}};
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({code: 'RATE_LIMITED'}), {status: 429})));
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewerScope="viewer-a" />);
    const scrollRegion = screen.getByRole('region', {name: 'Comments'});

    expect(scrollRegion).toHaveAttribute('data-composer-mode', 'authenticated');
    expect(scrollRegion).toHaveAttribute('data-replying', 'false');
    expect(scrollRegion).toHaveAttribute('data-composer-feedback', 'false');

    fireEvent.click(within(container.querySelector('.comment-thread-item')!).getByRole('button', {name: 'Reply 0'}));
    expect(scrollRegion).toHaveAttribute('data-replying', 'true');
    fireEvent.click(screen.getByRole('button', {name: 'Cancel reply'}));
    expect(scrollRegion).toHaveAttribute('data-replying', 'false');

    fireEvent.change(screen.getByRole('textbox', {name: 'Write a comment'}), {target: {value: 'Keep this draft'}});
    fireEvent.click(screen.getByRole('button', {name: 'Comment'}));
    expect(await screen.findByText('Action failed. Try again.')).toBeVisible();
    await waitFor(() => expect(scrollRegion).toHaveAttribute('data-composer-feedback', 'true'));
    fireEvent.change(screen.getByRole('textbox', {name: 'Write a comment'}), {target: {value: 'Revised draft'}});
    await waitFor(() => expect(scrollRegion).toHaveAttribute('data-composer-feedback', 'false'));
  });

  it("publishes signin and loading composer modes while keeping their reachable reply state explicit", () => {
    const comment = testComment({id: "33333333-3333-4333-8333-333333333333", parentCommentId: null, body: "Parent", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    const detail: PostDetail = {...post, comments: {groups: rootGroups([comment]), nextCursor: null}};
    const {container, rerender} = render(<PostDetailContent labels={labels} locale="en" result={{status: "ok", data: detail}} />);
    const scrollRegion = screen.getByRole('region', {name: 'Comments'});

    expect(scrollRegion).toHaveAttribute('data-composer-mode', 'signin');
    fireEvent.click(within(container.querySelector('.comment-thread-item')!).getByRole('button', {name: 'Reply 0'}));
    expect(scrollRegion).toHaveAttribute('data-replying', 'true');
    expect(container.querySelector('.comment-signin--reply')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Cancel reply'}));

    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    rerender(<PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} />);
    expect(scrollRegion).toHaveAttribute('data-composer-mode', 'loading');
    expect(scrollRegion).toHaveAttribute('data-composer-feedback', 'false');
    fireEvent.click(within(container.querySelector('.comment-thread-item')!).getByRole('button', {name: 'Reply 0'}));
    expect(scrollRegion).toHaveAttribute('data-replying', 'true');
    expect(within(container.querySelector('.post-detail-composer-dock')!).getByRole('status', {name: 'Comments'})).toBeVisible();
  });

  it("keeps a comment author relationship after closing and reopening the preview", async () => {
    const comment = testComment({id: "55555555-5555-4555-8555-555555555555", parentCommentId: null, body: "IP reply", createdAt: "2026-08-31T12:06:00.000Z", author: ip});
    const detail: PostDetail = {...post, comments: {groups: rootGroups([comment]), nextCursor: null}};
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({profile: ip, followerCount: 12, viewerFollows: false, posts: {items: [], nextCursor: null}}))
      .mockResolvedValueOnce(Response.json({created: true}))
      .mockResolvedValueOnce(Response.json({deleted: true}));
    vi.stubGlobal("fetch", request);
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewerScope="viewer-a" />);
    const commentRow = container.querySelector<HTMLElement>(".comment-thread-item")!;
    const trigger = within(commentRow).getByRole("button", {name: "Profile: Luma"});

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", {name: "Follow"}));
    expect(await screen.findByRole("button", {name: "Following"})).toBeVisible();
    fireEvent.keyDown(document, {key: "Escape"});
    fireEvent.click(trigger);
    expect(screen.getByRole("button", {name: "Following"})).toBeVisible();

    fireEvent.click(screen.getByRole("button", {name: "Following"}));
    expect(await screen.findByRole("button", {name: "Follow"})).toBeVisible();
    fireEvent.keyDown(document, {key: "Escape"});
    fireEvent.click(trigger);
    expect(screen.getByRole("button", {name: "Follow"})).toBeVisible();
    const relationshipMutations = request.mock.calls.filter(([url]) => url === `/api/social/profiles/${ip.id}/follow`);
    expect(relationshipMutations.map(([, init]) => init?.method)).toEqual(["PUT", "DELETE"]);
  });

  it("uses a compact reply composer rather than a large boxed form", () => {
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewerScope="viewer-a" />);

    expect(container.querySelector(".comment-composer--primary")).toBeTruthy();
    expect(screen.getByRole("textbox", {name: "Write a comment"})).toHaveAttribute("rows", "1");
    expect(screen.getByRole("button", {name: "Comment"})).toBeDisabled();
  });

  it("passes the resolved current viewer only to the primary composer", () => {
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewer={{displayName: viewerAccount.displayName, avatarUrl: viewerAccount.avatarUrl}} viewerScope="viewer-a" />);

    expect(within(container.querySelector('.post-detail-composer-dock')!).getByRole('img', {name: 'Rui'})).toHaveAttribute('src', viewerAccount.avatarUrl);
  });

  it("switches an open composer to provider account updates without fetching again", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};
    render(<CurrentAccountProvider initialAccount={viewerAccount}><PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewer={{displayName: viewerAccount.displayName, avatarUrl: viewerAccount.avatarUrl}} viewerScope="viewer-a" /></CurrentAccountProvider>);

    expect(screen.getByRole("img", {name: "Rui"})).toHaveAttribute("src", viewerAccount.avatarUrl);
    act(() => publishAccountUpdate({...viewerAccount, displayName: "Sam", avatarUrl: "https://media.example/sam.webp", profileVersion: 2}));

    expect(screen.getByRole("img", {name: "Sam"})).toHaveAttribute("src", "https://media.example/sam.webp");
    expect(screen.queryByRole("img", {name: "Rui"})).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("never commits a new authenticated scope with the previous viewer identity", () => {
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewer={{displayName: "Rui", avatarUrl: viewerAccount.avatarUrl}} viewerScope="viewer-a" />));

    flushSync(() => root.render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewer={{displayName: "Sam", avatarUrl: "https://media.example/sam.webp"}} viewerScope="viewer-b" />));

    expect(within(container).getByRole("img", {name: "Sam"})).toHaveAttribute("src", "https://media.example/sam.webp");
    expect(within(container).queryByRole("img", {name: "Rui"})).toBeNull();
    flushSync(() => root.unmount());
  });

  it("removes authenticated mutation controls in the first anonymous or unresolved commit", () => {
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewer={{displayName: "Rui", avatarUrl: viewerAccount.avatarUrl}} viewerScope="viewer-a" />));

    flushSync(() => root.render(<PostDetailContent labels={labels} locale="en" result={{status: "ok", data: detail}} />));
    expect(within(container).queryByRole("textbox", {name: "Write a comment"})).toBeNull();
    expect(within(container).getByRole("link", {name: "Sign in to comment"})).toBeTruthy();
    expect(within(container).queryByRole("img", {name: "Rui"})).toBeNull();

    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    flushSync(() => root.render(<PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} />));
    expect(within(container).getByRole("status", {name: "Comments"})).toHaveAttribute("aria-busy", "true");
    expect(within(container).queryByRole("textbox", {name: "Write a comment"})).toBeNull();
    flushSync(() => root.unmount());
  });

  it("renders one composer after the toolbar in the single scroll region while optimistic comments update the action count", async () => {
    const older = testComment({id: "55555555-5555-4555-8555-555555555555", parentCommentId: null, body: "Older comment", createdAt: "2026-09-01T12:00:00.000Z", author: ip});
    const detail: PostDetail = {...post, comments: {groups: rootGroups([older]), nextCursor: null}};
    const created = testComment({id: "33333333-3333-4333-8333-833333333333", parentCommentId: null, body: "Fresh reply", createdAt: "2026-09-02T12:00:00.000Z", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(created, {status: 201})));
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewerScope="viewer-a" />);

    const scrollRegion = screen.getByRole('region', {name: 'Comments'});
    const dock = container.querySelector<HTMLElement>('.post-detail-composer-dock')!;
    expect(container.children).toHaveLength(1);
    expect(container.children[0]).toBe(scrollRegion);
    expect(scrollRegion).toContainElement(container.querySelector('article.post-card'));
    expect(scrollRegion).toContainElement(container.querySelector('.comments-toolbar'));
    expect(scrollRegion).toContainElement(container.querySelector('.comments-section'));
    expect(scrollRegion).toContainElement(dock);
    expect(container.querySelector('.comments-toolbar')?.nextElementSibling).toBe(dock);
    expect(dock.querySelector('.comment-composer--primary')).not.toBeNull();
    const initialCommentAction = screen.getByRole('link', {name: 'Comments 2'});
    expect(initialCommentAction).toHaveAttribute('aria-current', 'page');
    expect(initialCommentAction.querySelector('svg')).toHaveAttribute('fill', 'currentColor');

    fireEvent.change(screen.getByRole('textbox', {name: 'Write a comment'}), {target: {value: created.body}});
    fireEvent.click(screen.getByRole('button', {name: 'Comment'}));
    const updatedCommentAction = await screen.findByRole('link', {name: 'Comments 3'});
    expect(updatedCommentAction).toHaveAttribute('aria-current', 'page');
    expect(updatedCommentAction.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    expect(dock).not.toHaveStyle({overflowY: 'auto'});
    expect([...container.querySelectorAll('.comment-thread-group')].map((group) => group.textContent)).toEqual([expect.stringContaining('Fresh reply'), expect.stringContaining('Older comment')]);
  });

  it("uses shared mobile scroll-clearance variables on the actual list and detail scroll surfaces", () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src' : 'apps/web/src';
    const source = readFileSync(`${root}/components/social/PostDetailContent.tsx`, 'utf8');
    const stylesheet = readFileSync(`${root}/app/globals.css`, 'utf8');

    expect(source).not.toContain('ResizeObserver');
    expect(source).not.toContain('composerDockHeight');
    expect(source).not.toContain('composerDock =');
    expect(source).not.toContain('CSSProperties');
    expect(source).not.toContain('--post-detail-composer-reserve');
    expect(stylesheet).toMatch(/\.post-detail-scroll-region\s*\{[^}]*min-height:\s*0[^}]*min-width:\s*0[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain[^}]*scrollbar-width:\s*none/);
    expect(stylesheet).toMatch(/\.post-detail-scroll-region::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
    expect(stylesheet).toMatch(/\.post-detail-composer-dock\s*\{[^}]*background:\s*var\(--shell-surface\)/);
    expect(stylesheet).toMatch(/--mobile-safe-area-bottom:\s*env\(safe-area-inset-bottom\)/);
    expect(stylesheet).toMatch(/--mobile-bottom-nav-height:\s*calc\(50px \+ var\(--mobile-safe-area-bottom\)\)/);
    expect(stylesheet).toMatch(/--mobile-scroll-breathing-room:\s*16px/);
    expect(stylesheet).toMatch(/--post-detail-composer-clearance:\s*83px/);
    expect(stylesheet).toMatch(/--post-detail-signin-clearance:\s*65px/);
    expect(stylesheet).toMatch(/--post-detail-loading-clearance:\s*58px/);
    expect(stylesheet).toMatch(/--post-detail-reply-clearance:\s*48px/);
    expect(stylesheet).toMatch(/--post-detail-feedback-clearance:\s*27px/);
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\[data-social-surface-viewport\]\[data-social-surface-viewport-layout="scroll"\]\s*\{[^}]*--social-scroll-bottom-clearance:\s*var\(--mobile-scroll-breathing-room\)[^}]*scroll-padding-bottom:\s*var\(--social-scroll-bottom-clearance\)/);
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-detail-scroll-region\s*\{[^}]*--post-detail-mode-clearance:\s*0px[^}]*--post-detail-reply-state-clearance:\s*0px[^}]*--post-detail-feedback-state-clearance:\s*0px[^}]*--social-scroll-bottom-clearance:\s*calc\(var\(--post-detail-mode-clearance\) \+ var\(--post-detail-reply-state-clearance\) \+ var\(--post-detail-feedback-state-clearance\) \+ var\(--mobile-scroll-breathing-room\)\)[^}]*scroll-padding-bottom:\s*var\(--social-scroll-bottom-clearance\)/);
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-detail-page \[data-social-surface-frame\]\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/);
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-detail-page \[data-social-surface-viewport\]\[data-social-surface-viewport-layout="docked"\]\s*\{[^}]*height:\s*auto/);
    expect(stylesheet).toMatch(/\[data-social-surface-viewport\]\[data-social-surface-viewport-layout="scroll"\]::after\s*\{[^}]*content:\s*""[^}]*display:\s*block[^}]*height:\s*var\(--social-scroll-bottom-clearance\)/);
    expect(stylesheet).toMatch(/\.post-detail-scroll-region::after\s*\{[^}]*content:\s*""[^}]*display:\s*block[^}]*height:\s*var\(--social-scroll-bottom-clearance\)/);
    expect(stylesheet).toMatch(/\.post-detail-scroll-region\[data-replying="true"\]\s*\{[^}]*--post-detail-reply-state-clearance:\s*var\(--post-detail-reply-clearance\)/);
    expect(stylesheet).toMatch(/\.post-detail-scroll-region\[data-composer-mode="authenticated"\]\[data-composer-feedback="true"\]\s*\{[^}]*--post-detail-feedback-state-clearance:\s*var\(--post-detail-feedback-clearance\)/);
    expect(stylesheet).toMatch(/\.post-detail-scroll-region\[data-composer-mode="authenticated"\]\s*\{[^}]*--post-detail-mode-clearance:\s*var\(--post-detail-composer-clearance\)/);
    expect(stylesheet).toMatch(/\.post-detail-scroll-region\[data-composer-mode="signin"\]\s*\{[^}]*--post-detail-mode-clearance:\s*var\(--post-detail-signin-clearance\)/);
    expect(stylesheet).toMatch(/\.post-detail-scroll-region\[data-composer-mode="loading"\]\s*\{[^}]*--post-detail-mode-clearance:\s*var\(--post-detail-loading-clearance\)/);
    expect(stylesheet).not.toContain(':has(');
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-detail-composer-dock\s*\{[^}]*bottom:\s*var\(--mobile-bottom-nav-height\)[^}]*position:\s*fixed/);
    expect(stylesheet).toMatch(/\.mobile-nav\s*\{[^}]*height:\s*var\(--mobile-bottom-nav-height\)[^}]*padding:\s*0 max\(8px, env\(safe-area-inset-left\)\) var\(--mobile-safe-area-bottom\)/);
    expect(stylesheet).not.toMatch(/\.comments-section\s*\{[^}]*padding-bottom/);
    expect(source.match(/<CommentComposer/g)).toHaveLength(1);
    expect(stylesheet).not.toContain('--post-detail-composer-reserve');
  });

  it("keeps the private activity feed inside the shared bounded scroll surface", () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src' : 'apps/web/src';
    const source = readFileSync(`${root}/app/[locale]/activity/page.tsx`, 'utf8');

    expect(source).toContain("import {SocialSurface} from '../../../components/social/SocialSurface'");
    expect(source).toContain('<SocialSurface');
    expect(source).toContain('className="activity-page"');
    expect(source).toContain('frameMode="attached"');
    expect(source).toContain('header={header}');
    expect(source).not.toMatch(/return <main>/);
  });

  it("renders real notification rows and safe empty/auth states", () => {
    const notification: Notification = {
      id: "66666666-6666-4666-8666-666666666666",
      kind: "post_like",
      actor: {
        kind: "human",
        id: "44444444-4444-4444-8444-444444444444",
        username: "alex",
        displayName: "Alex",
      },
      postId: post.id,
      commentId: null,
      createdAt: "2026-08-31T12:07:00.000Z",
      readAt: null,
    };
    const { rerender } = render(
      <NotificationsContent
        labels={labels}
        locale="zh-CN"
        moreHref="/zh-CN/notifications?cursor=next"
        result={{
          status: "ok",
          data: { items: [notification], nextCursor: "next" },
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Alex liked your post/ }),
    ).toHaveTextContent("Alex liked your post");
    expect(
      screen.getByRole("link", { name: /Alex liked your post/ }),
    ).toHaveAttribute("href", `/zh-CN/posts/${post.id}`);
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      "/zh-CN/notifications?cursor=next",
    );
    rerender(
      <NotificationsContent
        labels={labels}
        locale="zh-CN"
        result={{ status: "auth-required" }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Sign in required" }),
    ).toBeVisible();
  });

  it("submits authenticated human comments through the same-origin proxy", async () => {
    routerRefresh.mockClear();
    const createdComment = testComment({id: "66666666-6666-4666-8666-666666666666", parentCommentId: null, body: "Hello IP", createdAt: "2026-08-31T12:08:00.000Z", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(createdComment), { status: 201 }),
      );
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {
      ...post,
      comments: { groups: [], nextCursor: null },
    };
    const {rerender} = render(
      <PostDetailContent
        authenticated
        labels={labels}
        locale="en"
        result={{ status: "ok", data: detail }}
        viewerScope="viewer-a"
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Write a comment" }), {
      target: { value: "Hello IP" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        `/api/social/posts/${post.id}/comments`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ body: "Hello IP" }),
        }),
      ),
    );
    expect(await screen.findByText("Hello IP", {selector: ".comment-thread-content > p"})).toBeVisible();
    rerender(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: {...detail, comments: {...detail.comments, groups: [...detail.comments.groups]}}}} viewerScope="viewer-a"/>);
    expect(screen.getByText("Hello IP", {selector: ".comment-thread-content > p"})).toBeVisible();
    const primaryComposer = within(document.querySelector('.post-detail-composer-dock')!).getByRole("textbox", {name: "Write a comment"});
    expect(primaryComposer).toHaveValue("");
    expect(primaryComposer).toHaveFocus();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("keeps a paginated local comment without double-counting after the server total refreshes", async () => {
    const firstPage = Array.from({length: 25}, (_, index) => testComment({
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
      parentCommentId: null,
      body: `Older comment ${index + 1}`,
      createdAt: `2026-08-31T12:${String(index).padStart(2, "0")}:00.000Z`,
      author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"},
    }));
    const createdComment = testComment({id: "66666666-6666-4666-8666-666666666666", parentCommentId: null, body: "Fresh paginated comment", createdAt: "2026-08-31T12:30:00.000Z", author: {kind: "human", id: "55555555-5555-4555-8555-555555555555", username: "sam", displayName: "Sam"}});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(createdComment, {status: 201})));
    const initial: PostDetail = {...post, commentCount: 25, comments: {groups: rootGroups(firstPage), nextCursor: "page-two"}};
    const {container, rerender} = render(<PostDetailContent authenticated labels={labels} locale="en" moreHref={`/en/posts/${post.id}?commentCursor=page-two`} result={{status: "ok", data: initial}} viewerScope="viewer-a" />);

    const primaryComposer = within(container.querySelector('.post-detail-composer-dock')!);
    fireEvent.change(primaryComposer.getByRole("textbox", {name: "Write a comment"}), {target: {value: createdComment.body!}});
    fireEvent.click(primaryComposer.getByRole("button", {name: "Comment"}));
    expect(await screen.findByRole("link", {name: "Comments 26"})).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("Posted")).toBeVisible();

    const refreshed: PostDetail = {...initial, commentCount: 26, comments: {groups: rootGroups(firstPage), nextCursor: "page-two"}};
    rerender(<PostDetailContent authenticated labels={labels} locale="en" moreHref={`/en/posts/${post.id}?commentCursor=page-two`} result={{status: "ok", data: refreshed}} viewerScope="viewer-a" />);

    expect(screen.getByRole("link", {name: "Comments 26"})).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(createdComment.body!, {selector: ".comment-thread-content > p"})).toBeVisible();
    expect(screen.getByText("Posted")).toBeVisible();
    expect(container.querySelectorAll(".comment-thread-item")).toHaveLength(26);
    expect(screen.getByRole("link", {name: "Load more"})).toBeVisible();

    rerender(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: {...refreshed, comments: {groups: rootGroups([...firstPage, createdComment]), nextCursor: null}}}} viewerScope="viewer-a" />);
    expect(screen.getAllByText(createdComment.body!, {selector: ".comment-thread-content > p"})).toHaveLength(1);
  });

  it("switches comment result scopes in the render that receives a different post", () => {
    const oldComment = testComment({id: "33333333-3333-4333-8333-333333333333", parentCommentId: null, body: "Old post comment", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    const oldDetail: PostDetail = {...post, comments: {groups: rootGroups([oldComment]), nextCursor: null}};
    const nextPost = {...post, id: "55555555-5555-4555-8555-555555555555", body: "New post"};
    const nextComment = {...testComment({id: "66666666-6666-4666-8666-666666666666", parentCommentId: null, body: "New post comment", createdAt: "2026-08-31T12:06:00.000Z", author: {kind: "human", id: "77777777-7777-4777-8777-777777777777", username: "sam", displayName: "Sam"}}), postId: nextPost.id};
    const nextDetail: PostDetail = {...nextPost, comments: {groups: rootGroups([nextComment]), nextCursor: null}};
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: oldDetail}}/>));
    expect(container).toHaveTextContent("Old post comment");

    flushSync(() => root.render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: nextDetail}}/>));

    expect(container).toHaveTextContent("New post comment");
    expect(container).not.toHaveTextContent("Old post comment");
    flushSync(() => root.unmount());
  });

  it("shows the new server comments immediately when the same post cursor changes", () => {
    const first = testComment({id: "33333333-3333-4333-8333-333333333333", parentCommentId: null, body: "First page comment", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    const second = testComment({id: "55555555-5555-4555-8555-555555555555", parentCommentId: null, body: "Second page comment", createdAt: "2026-08-31T12:06:00.000Z", author: {kind: "human", id: "66666666-6666-4666-8666-666666666666", username: "sam", displayName: "Sam"}});
    const firstPage: PostDetail = {...post, comments: {groups: rootGroups([first]), nextCursor: "page-two"}};
    const secondPage: PostDetail = {...post, comments: {groups: rootGroups([second]), nextCursor: null}};
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<PostDetailContent authenticated labels={labels} locale="en" returnTo={`/en/posts/${post.id}`} result={{status: "ok", data: firstPage}}/>));
    flushSync(() => root.render(<PostDetailContent authenticated labels={labels} locale="en" returnTo={`/en/posts/${post.id}?commentCursor=page-two`} result={{status: "ok", data: secondPage}}/>));

    expect(container).toHaveTextContent("Second page comment");
    expect(container).not.toHaveTextContent("First page comment");
    flushSync(() => root.unmount());
  });

  it("uses fresh server comments to update and remove existing comments on the current page", () => {
    const original = testComment({id: "33333333-3333-4333-8333-333333333333", parentCommentId: null, body: "Original", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}});
    const removed = testComment({id: "55555555-5555-4555-8555-555555555555", parentCommentId: null, body: "Removed", createdAt: "2026-08-31T12:06:00.000Z", author: {kind: "human", id: "66666666-6666-4666-8666-666666666666", username: "sam", displayName: "Sam"}});
    const initial: PostDetail = {...post, comments: {groups: rootGroups([original, removed]), nextCursor: null}};
    const refreshed: PostDetail = {...initial, comments: {groups: rootGroups([{...original, body: "Updated"}]), nextCursor: null}};
    const {rerender} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: initial}}/>);

    rerender(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: refreshed}}/>);

    expect(screen.getByText("Updated")).toBeVisible();
    expect(screen.queryByText("Original")).toBeNull();
    expect(screen.queryByText("Removed")).toBeNull();
  });

  it("resolves an inconclusive server session before hiding the real comment composer", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(viewerAccount));
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} /></CurrentAccountProvider>);

    expect(screen.getByRole("status", {name: "Comments"})).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByRole("textbox", {name: "Write a comment"})).toBeVisible();
    expect(screen.getByRole('img', {name: 'Rui'})).toHaveAttribute('src', viewerAccount.avatarUrl);
    expect(request).toHaveBeenCalledWith("/api/me", expect.objectContaining({cache: "no-store", credentials: "include"}));
  });

  it("uses the provider's single account request for unresolved detail access", async () => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(Response.json(viewerAccount)));
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} /></CurrentAccountProvider>);

    expect(await screen.findByRole("textbox", {name: "Write a comment"})).toBeVisible();
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("/api/me", expect.objectContaining({cache: "no-store", credentials: "include"}));
  });

  it("keeps server-authenticated mutations gated until a missing account resolves on the client", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(viewerAccount));
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent accountResolutionNeeded authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewerScope="token-scope" /></CurrentAccountProvider>);

    expect(screen.getByRole("status", {name: "Comments"})).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
    expect(await screen.findByRole("textbox", {name: "Write a comment"})).toBeVisible();
    expect(screen.getByRole("img", {name: "Rui"})).toHaveAttribute("src", viewerAccount.avatarUrl);
    expect(screen.getByRole("button", {name: "Unlike 4"})).toBeVisible();
  });

  it("does not reopen authenticated mutations when missing-account client resolution fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status: 401})));
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent accountResolutionNeeded authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} viewerScope="token-scope" /></CurrentAccountProvider>);

    expect(await screen.findByRole("link", {name: "Sign in to comment"})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Unlike 4"})).toBeNull();
  });

  it.each([204, 503])("does not treat an account response with status %i as authenticated", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status})));
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} /></CurrentAccountProvider>);

    expect(await screen.findByRole("link", {name: "Sign in to comment"})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
  });

  it("does not treat an invalid account payload as authenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({profileId: "not-a-uuid"}), {status: 200})));
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} /></CurrentAccountProvider>);

    expect(await screen.findByRole("link", {name: "Sign in to comment"})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
  });

  it("keeps comment mutations disabled when account resolution fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} /></CurrentAccountProvider>);

    expect(await screen.findByRole("link", {name: "Sign in to comment"})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
  });

  it("submits a comment after a valid client account resolution", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(viewerAccount))
      .mockResolvedValueOnce(new Response(JSON.stringify({id: "comment"}), {status: 201}));
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};

    render(<CurrentAccountProvider><PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} /></CurrentAccountProvider>);

    fireEvent.change(await screen.findByRole("textbox", {name: "Write a comment"}), {target: {value: "Resolved session"}});
    fireEvent.click(screen.getByRole("button", {name: "Comment"}));

    await vi.waitFor(() => expect(request).toHaveBeenNthCalledWith(2, `/api/social/posts/${post.id}/comments`, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({body: "Resolved session"}),
    })));
  });

  it("keeps guest comment sign-in on the localized post detail route", () => {
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};
    render(<PostDetailContent authenticated={false} labels={labels} locale="zh-CN" returnTo={`/zh-CN/posts/${post.id}?commentCursor=comments-next`} result={{status: "ok", data: detail}} />);

    expect(screen.getByRole("link", {name: "Sign in to comment"})).toHaveAttribute(
      "href",
      `/zh-CN/auth/sign-in?next=${encodeURIComponent(`/zh-CN/posts/${post.id}?commentCursor=comments-next`)}`,
    );
  });

  it("renders a localized empty state when a post has no comments", () => {
    const detail: PostDetail = {...post, comments: {groups: [], nextCursor: null}};
    render(<PostDetailContent authenticated labels={{...labels, commentsEmptyTitle: "No comments yet", commentsEmptyDescription: "Start the conversation."}} locale="en" result={{status: "ok", data: detail}} />);

    expect(screen.getByRole("heading", {name: "No comments yet"})).toBeVisible();
    expect(screen.getByText("Start the conversation.")).toBeVisible();
  });

  it("renders a public AI/IP profile without private creator operation fields", () => {
    const data = {
      profile: ip,
      followerCount: 12,
      posts: { items: [post], nextCursor: null },
    };
    const { container } = render(
      <PublicProfileContent
        labels={labels}
        locale="en"
        result={{ status: "ok", data }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Luma" })).toBeVisible();
    expect(
      screen.getAllByText("Created by @luma_creator").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("12 followers")).toBeVisible();
    expect(screen.queryByText("Anime")).toBeNull();
    expect(container.textContent).not.toContain("operationEnabled");
  });
});
