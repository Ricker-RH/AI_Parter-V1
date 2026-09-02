import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FeedPost, Notification, PostDetail } from "@aifans/contracts";
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
const post: FeedPost = {
  id: "22222222-2222-4222-8222-222222222222",
  body: "A real post",
  languageCode: "en",
  publishedAt: "2026-08-31T12:00:00.000Z",
  author: ip,
  likeCount: 4,
  commentCount: 2,
  viewerHasLiked: true,
  viewerHasBookmarked: false,
  viewerFollowsAuthor: false,
};

describe("real social content", () => {
  it("makes feed and detail scroll containers named keyboard regions", () => {
    const {container, rerender} = render(
      <FeedContent
        labels={labels}
        locale="en"
        result={{ status: "ok", data: { items: [post], nextCursor: null } }}
      />,
    );
    expect(container.querySelector(".feed-list")).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", {name: "Posts"})).toBeVisible();

    rerender(
      <PostDetailContent
        labels={labels}
        locale="en"
        result={{status: "ok", data: {...post, comments: {items: [], nextCursor: null}}}}
      />,
    );
    expect(container.querySelector(".post-detail-content")).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", {name: "Posts"})).toBeVisible();
  });

  it("keeps an unavailable post detail inside the same named scroll region", () => {
    const {container} = render(
      <PostDetailContent
        labels={labels}
        locale="en"
        result={{status: "unavailable"}}
      />,
    );
    expect(container.querySelector(".post-detail-content")).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", {name: "Posts"})).toContainElement(screen.getByRole("alert"));
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
    const mediaPost: FeedPost = {
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
    expect(screen.getByRole("link", { name: "Like" })).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen");
    expect(screen.getByRole("link", { name: "Bookmark" })).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen");
    expect(screen.getByRole("link", { name: "Comments" })).toHaveAttribute("href", `/en/posts/${post.id}`);
    expect(screen.queryByRole("button", {name: "Like"})).toBeNull();
  });

  it("keeps authenticated false relationship values interactive", () => {
    const signedIn = {...post, viewerHasLiked: false, viewerHasBookmarked: false, viewerFollowsAuthor: false};
    render(<FeedContent canMutate labels={labels} locale="en" result={{status: "ok", data: {items: [signedIn], nextCursor: null}}} />);

    expect(screen.getByRole("button", {name: "Like"})).toBeEnabled();
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

  it("distinguishes human and IP comments and uses a placeholder for deleted bodies", () => {
    const detail: PostDetail = {
      ...post,
      comments: {
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            postId: post.id,
            parentCommentId: null,
            state: "published",
            body: "Human reply",
            createdAt: "2026-08-31T12:05:00.000Z",
            author: {
              kind: "human",
              id: "44444444-4444-4444-8444-444444444444",
              username: "alex",
              displayName: "Alex",
            },
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            postId: post.id,
            parentCommentId: null,
            state: "deleted",
            createdAt: "2026-08-31T12:06:00.000Z",
            author: ip,
          },
        ],
        nextCursor: "comments-next",
      },
    };
    detail.comments.items[1] = {
      ...detail.comments.items[1]!,
      author: {
        ...ip,
        creator: { ...ip.creator, username: "comment_creator" },
      },
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
    expect(screen.getByText("Created by @comment_creator")).toBeVisible();
    expect(screen.getByRole("img", {name: "Alex"})).toHaveTextContent("A");
    expect(screen.getByText("5m")).toHaveAttribute("datetime", "2026-08-31T12:05:00.000Z");
    expect(screen.getByRole("heading", {name: "Comments"})).toBeVisible();
    expect(screen.getByText('Chronological')).toBeVisible();
    expect(document.querySelectorAll(".comment-thread-item")).toHaveLength(2);
    const commentRows = container.querySelectorAll<HTMLElement>(".comment-thread-item");
    expect(within(commentRows[0]!).queryByRole("link", {name: "Alex"})).toBeNull();
    expect(within(commentRows[0]!).getByRole("img", {name: "Alex"})).toBeVisible();
    expect(within(commentRows[1]!).getByRole("link", {name: "Luma"})).toHaveAttribute("href", `/en/profiles/${ip.id}`);
    expect(within(commentRows[1]!).getByRole("button", {name: "Profile: Luma"})).toBeVisible();
    fireEvent.click(within(commentRows[1]!).getByRole("button", {name: "Profile: Luma"}));
    const preview = screen.getByRole("dialog", {name: "Luma"});
    expect(within(preview).queryByRole("link", {name: labels.startChat})).toBeNull();
    fireEvent.keyDown(document, {key: "Escape"});
    expect(screen.queryByRole("dialog", {name: "Luma"})).toBeNull();
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
    expect(screen.getByText("创建者 @comment_creator")).toBeVisible();
    expect(screen.getByRole("img", {name: "Alex"})).toHaveTextContent("A");
    expect(screen.queryByLabelText(/avatar/i)).toBeNull();
  });

  it("renders replies as an indented connected thread and keeps the real parent action", () => {
    const parentId = "33333333-3333-4333-8333-333333333333";
    const detail: PostDetail = {
      ...post,
      comments: {items: [
        {id: parentId, postId: post.id, parentCommentId: null, state: "published", body: "Parent", createdAt: "2026-08-31T12:05:00.000Z", author: {kind: "human", id: "44444444-4444-4444-8444-444444444444", username: "alex", displayName: "Alex"}},
        {id: "55555555-5555-4555-8555-555555555555", postId: post.id, parentCommentId: parentId, state: "published", body: "Nested reply", createdAt: "2026-08-31T12:06:00.000Z", author: ip},
      ], nextCursor: null},
    };
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" referenceTime={Date.parse("2026-08-31T12:10:00.000Z")} result={{status: "ok", data: detail}} />);

    expect(container.querySelector(".comment-thread-item--reply")).toHaveTextContent("Nested reply");
    expect(container.querySelector(".comment-thread-item--reply")).toHaveAttribute("data-parent-comment-id", parentId);
    expect(screen.getByText("Reply", {selector: "summary"})).toBeVisible();
  });

  it("keeps a comment author relationship after closing and reopening the preview", async () => {
    const comment = {id: "55555555-5555-4555-8555-555555555555", postId: post.id, parentCommentId: null, state: "published" as const, body: "IP reply", createdAt: "2026-08-31T12:06:00.000Z", author: ip};
    const detail: PostDetail = {...post, comments: {items: [comment], nextCursor: null}};
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({profile: ip, followerCount: 12, viewerFollows: false, posts: {items: [], nextCursor: null}}))
      .mockResolvedValueOnce(new Response(null, {status: 204}))
      .mockResolvedValueOnce(new Response(null, {status: 204}));
    vi.stubGlobal("fetch", request);
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} />);
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
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};
    const {container} = render(<PostDetailContent authenticated labels={labels} locale="en" result={{status: "ok", data: detail}} />);

    expect(container.querySelector(".comment-composer--primary")).toBeTruthy();
    expect(screen.getByRole("textbox", {name: "Write a comment"})).toHaveAttribute("rows", "1");
    expect(screen.getByRole("button", {name: "Comment"})).toBeDisabled();
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
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "comment" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {
      ...post,
      comments: { items: [], nextCursor: null },
    };
    render(
      <PostDetailContent
        authenticated
        labels={labels}
        locale="en"
        result={{ status: "ok", data: detail }}
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
  });

  it("resolves an inconclusive server session before hiding the real comment composer", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({profileId: "44444444-4444-4444-8444-444444444444"}), {status: 200}));
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};

    render(<PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} />);

    expect(screen.getByRole("status", {name: "Comments"})).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByRole("textbox", {name: "Write a comment"})).toBeVisible();
    expect(request).toHaveBeenCalledWith("/api/account", expect.objectContaining({cache: "no-store", credentials: "include"}));
  });

  it.each([204, 503])("does not treat an account response with status %i as authenticated", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status})));
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};

    render(<PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} />);

    expect(await screen.findByRole("link", {name: "Sign in to comment"})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
  });

  it("does not treat an invalid account payload as authenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({profileId: "not-a-uuid"}), {status: 200})));
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};

    render(<PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} />);

    expect(await screen.findByRole("link", {name: "Sign in to comment"})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
  });

  it("keeps comment mutations disabled when account resolution fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};

    render(<PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} />);

    expect(await screen.findByRole("link", {name: "Sign in to comment"})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Write a comment"})).toBeNull();
  });

  it("submits a comment after a valid client account resolution", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({profileId: "44444444-4444-4444-8444-444444444444"}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({id: "comment"}), {status: 201}));
    vi.stubGlobal("fetch", request);
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};

    render(<PostDetailContent authResolutionNeeded labels={labels} locale="en" result={{status: "ok", data: detail}} />);

    fireEvent.change(await screen.findByRole("textbox", {name: "Write a comment"}), {target: {value: "Resolved session"}});
    fireEvent.click(screen.getByRole("button", {name: "Comment"}));

    await vi.waitFor(() => expect(request).toHaveBeenNthCalledWith(2, `/api/social/posts/${post.id}/comments`, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({body: "Resolved session"}),
    })));
  });

  it("keeps guest comment sign-in on the localized post detail route", () => {
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};
    render(<PostDetailContent authenticated={false} labels={labels} locale="zh-CN" returnTo={`/zh-CN/posts/${post.id}?commentCursor=comments-next`} result={{status: "ok", data: detail}} />);

    expect(screen.getByRole("link", {name: "Sign in to comment"})).toHaveAttribute(
      "href",
      `/zh-CN/auth/sign-in?next=${encodeURIComponent(`/zh-CN/posts/${post.id}?commentCursor=comments-next`)}`,
    );
  });

  it("renders a localized empty state when a post has no comments", () => {
    const detail: PostDetail = {...post, comments: {items: [], nextCursor: null}};
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
