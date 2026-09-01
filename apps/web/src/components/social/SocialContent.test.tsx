import { fireEvent, render, screen } from "@testing-library/react";
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
  deletedComment: "This comment was deleted.",
  follow: "Follow",
  followingAction: "Following",
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
  visualTypeFilter: "IP style",
  allTypes: "All",
  realistic: "Realistic",
  anime: "Anime",
  hybrid: "Hybrid",
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
  it("renders API post fields and preserves the locale in the detail URL", () => {
    render(
      <FeedContent
        feedKind="for_you"
        labels={labels}
        locale="zh-CN"
        moreHref="/zh-CN?visualType=anime&cursor=opaque"
        result={{ status: "ok", data: { items: [post], nextCursor: "opaque" } }}
        visualType="anime"
      />,
    );
    expect(screen.getByRole("article")).toHaveTextContent("Luma");
    expect(screen.getByRole("article")).toHaveTextContent("A real post");
    expect(screen.getByRole("article")).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: /A real post/ })).toHaveAttribute(
      "href",
      `/zh-CN/posts/${post.id}`,
    );
    expect(screen.getByText("AI/IP")).toBeVisible();
    expect(
      screen.getAllByText("Created by @luma_creator").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Anime" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Realistic" })).toHaveAttribute(
      "href",
      "/zh-CN?visualType=realistic",
    );
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      "/zh-CN?visualType=anime&cursor=opaque",
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
    expect(container.querySelector(".post-media-grid")).toHaveAttribute(
      "data-count",
      "2",
    );
    expect(container.querySelectorAll(".post-media-grid img")).toHaveLength(2);
  });

  it("shows anonymous users a localized sign-in interaction control", () => {
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
    expect(
      screen.getByRole("link", { name: "Sign in to like, save, or follow" }),
    ).toHaveAttribute("href", "/en/auth/sign-in?next=%2Fen");
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

  it("normalizes legacy hybrid to All and keeps only the ordinary home filter values", () => {
    render(
      <FeedContent
        currentQuery="feed=following&visualType=hybrid&campaign=launch&cursor=stale"
        feedKind="following"
        labels={labels}
        locale="zh-CN"
        result={{ status: "ok", data: { items: [], nextCursor: null } }}
        visualType="all"
      />,
    );
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "href",
      "/zh-CN?feed=following&campaign=launch",
    );
    expect(screen.getByRole("tab", { name: "Realistic" })).toHaveAttribute(
      "href",
      "/zh-CN?feed=following&visualType=realistic&campaign=launch",
    );
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
    const { rerender } = render(
      <PostDetailContent
        labels={labels}
        locale="en"
        moreHref={`/en/posts/${post.id}?commentCursor=comments-next`}
        result={{ status: "ok", data: detail }}
      />,
    );
    expect(screen.getByText("Human")).toBeVisible();
    expect(screen.getAllByText("AI/IP").length).toBeGreaterThan(0);
    expect(screen.getByText("Human reply")).toBeVisible();
    expect(screen.getByText("This comment was deleted.")).toBeVisible();
    expect(screen.getByText("Created by @comment_creator")).toBeVisible();
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
    expect(container.textContent).not.toContain("operationEnabled");
  });
});
