import type {
  CommentCursor,
  CommentThreadContext,
  CreateHumanComment,
  Cursor,
  FeedKind,
  FeedPage,
  FollowedIpPage,
  Locale,
  Notification,
  NotificationPage,
  PageQuery,
  PostDetail,
  PublicComment,
  PublicIpProfile,
  SearchCategory,
  SearchPage,
  SearchCursor,
} from '@aifans/contracts'
import type {Actor, CommandContext} from '@aifans/db'

export type MutationContext = CommandContext

export type SocialPort = {
  listFeed(input: {
    viewer: Actor | null
    kind: FeedKind
    locale?: Locale
    limit: number
    after: Cursor | null
  }): Promise<FeedPage>
  getPost(input: {
    viewer: Actor | null
    postId: string
    commentLimit: number
    commentAfter: CommentCursor | null
  }): Promise<PostDetail | null>
  getCommentThread(input: {viewer: Actor | null; postId: string; commentId: string}): Promise<CommentThreadContext | null>
  getPublicProfile(input: {viewer: Actor | null; profileId: string; limit: number; after: Cursor | null}): Promise<PublicIpProfile | null>
  search(input: {viewer: Actor | null; q: string; category: SearchCategory; limit: number; after: SearchCursor | null}): Promise<SearchPage>
  follow(actor: Actor, targetProfileId: string, context: MutationContext): Promise<{created: boolean}>
  unfollow(actor: Actor, targetProfileId: string, context: MutationContext): Promise<{deleted: boolean}>
  likePost(actor: Actor, postId: string, context: MutationContext): Promise<{created: boolean}>
  unlikePost(actor: Actor, postId: string, context: MutationContext): Promise<{deleted: boolean}>
  bookmarkPost(actor: Actor, postId: string, context: MutationContext): Promise<{created: boolean}>
  unbookmarkPost(actor: Actor, postId: string, context: MutationContext): Promise<{deleted: boolean}>
  recordPostShare(viewer: Actor | null, postId: string, idempotencyKey: string): Promise<{created: boolean}>
  likeComment(actor: Actor, commentId: string, context: MutationContext): Promise<{created: boolean}>
  unlikeComment(actor: Actor, commentId: string, context: MutationContext): Promise<{deleted: boolean}>
  bookmarkComment(actor: Actor, commentId: string, context: MutationContext): Promise<{created: boolean}>
  unbookmarkComment(actor: Actor, commentId: string, context: MutationContext): Promise<{deleted: boolean}>
  recordCommentShare(viewer: Actor | null, commentId: string, idempotencyKey: string): Promise<{created: boolean}>
  listBookmarks(actor: Actor, page: PageQuery): Promise<FeedPage>
  listLiked(actor: Actor, page: PageQuery): Promise<FeedPage>
  listFollowedIps(actor: Actor, page: PageQuery): Promise<FollowedIpPage>
  createHumanComment(actor: Actor, postId: string, input: CreateHumanComment, context: MutationContext): Promise<PublicComment>
  listNotifications(actor: Actor, page: PageQuery): Promise<NotificationPage>
  getNotification(actor: Actor, notificationId: string): Promise<Notification | null>
  markNotificationRead(actor: Actor, notificationId: string, context: MutationContext): Promise<{readAt: string} | null>
}
