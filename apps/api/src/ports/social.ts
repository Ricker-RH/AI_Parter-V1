import type {
  CommentCursor,
  CreateHumanComment,
  Cursor,
  FeedKind,
  FeedPage,
  Locale,
  NotificationPage,
  PageQuery,
  PostDetail,
  PublicComment,
} from '@aifans/contracts'
import type {Actor} from '@aifans/db'

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
  follow(actor: Actor, targetProfileId: string): Promise<{created: boolean}>
  unfollow(actor: Actor, targetProfileId: string): Promise<{deleted: boolean}>
  likePost(actor: Actor, postId: string): Promise<{created: boolean}>
  unlikePost(actor: Actor, postId: string): Promise<{deleted: boolean}>
  bookmarkPost(actor: Actor, postId: string): Promise<{created: boolean}>
  unbookmarkPost(actor: Actor, postId: string): Promise<{deleted: boolean}>
  listBookmarks(actor: Actor, page: PageQuery): Promise<FeedPage>
  createHumanComment(actor: Actor, postId: string, input: CreateHumanComment): Promise<PublicComment>
  listNotifications(actor: Actor, page: PageQuery): Promise<NotificationPage>
  markNotificationRead(actor: Actor, notificationId: string): Promise<{readAt: string} | null>
}
