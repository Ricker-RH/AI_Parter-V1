# Social API preflight

**Status:** implementation-ready after the social-core migration lands. This is a route/port/repository sequence only; it adds no mock content and does not alter the public data model.

## Fixed boundaries

- Keep browser auth provider-neutral: `AuthVerifier.verify(request)` returns only a verified `subject`; route code derives the human account with `ProfilePort.getCurrentAccount({subject})`. Do not accept a human profile ID, auth subject, or operator ID in a request body.
- `apps/api/src/routes/me.ts` is the model for typed auth errors. Extend its dependency composition in `apps/api/src/app.ts`; return `ApiErrorSchema` bodies and retain `requestId` from `apps/api/src/middleware/request-id.ts`.
- User reads/writes use `withActor` / `DATABASE_USER_URL` and social-core RLS. Operator commands use a new server-only `DATABASE_PLATFORM_URL` repository after `isCurrentActorOperator({subject})`; never fall back to `DATABASE_ADMIN_URL` (migration/provisioning only).
- A platform command owns one transaction: business change + `workflow_transitions` (where state changes) + audit + allow-listed business event + optional outbox. It receives `{operatorProfileId, representedIpProfileId}` as separate internal fields. Browser JSON contains only the represented `ipProfileId`; the server derives the operator.
- No endpoint accepts arbitrary media URLs, R2 object keys, `acting_operator_profile_id`, `source`, `state`, or timestamps. R2 upload/object verification is deliberately after the text-only post path.

## File map and interfaces

Create these first; route handlers consume the port interfaces, never `@aifans/db` directly.

- Create `packages/contracts/src/social.ts`; export it from `packages/contracts/src/index.ts`. Define Zod request/query/response DTOs below, including `FeedPageSchema`, `PostDetailSchema`, `NotificationPageSchema`, and `CursorSchema`. Keep DB rows and operator/audit fields out of response DTOs.
- Create `packages/db/src/social.ts`; export `createSocialRepository`, `createPlatformSocialRepository`, their input/output types, and a bounded `createPlatformSession` (or `platform.ts`) from `packages/db/src/index.ts`. `SocialRepository` is user/public read composition; `PlatformSocialRepository` is server-only mutation composition. Do not export its pool.
- Modify `packages/db/src/history.ts` before its use: extend its *closed* Zod allow-lists with exactly the social action/event payloads below. Payloads may contain IDs, action source, locale, result code, and event UUID; never post/comment bodies, object keys, signed URLs, prompts, or credentials.
- Create `apps/api/src/ports/social.ts` with the route-facing `SocialPort`, and `apps/api/src/ports/social.database.ts` which composes the database repositories. Create `apps/api/src/ports/operators.ts` only if it cleanly owns `{isCurrentActorOperator, getCurrentAccount}`; otherwise make the operator check an internal helper in `routes/social-admin.ts`.
- Create `apps/api/src/routes/social.ts` and `apps/api/src/routes/social-admin.ts`; register both in `apps/api/src/app.ts`; export route-facing port types from `apps/api/src/index.ts`.
- Add focused route tests in `apps/api/src/routes/social.test.ts` and `apps/api/src/routes/social-admin.test.ts` (or keep them in the existing `apps/api/src/app.test.ts` if the project continues its single-file convention). Add repository/integration assertions to `packages/db/tests/social-core-rls.test.ts` and create `packages/db/tests/social-repository.test.ts` for cursor/order/atomicity fixtures.

### Stable DTOs

Use `z.strictObject` and reject unknown fields. UUID parameters use `z.uuid()`; body strings are trimmed before `min` checks.

```ts
type PageQuery = {limit?: number; cursor?: string}
type FeedKind = 'for_you' | 'following'
type FeedQuery = PageQuery & {kind: FeedKind; locale?: 'en' | 'zh-CN'}
type Cursor =
  | {v: 1; kind: 'chronological'; publishedAt: string; id: string}
  | {v: 1; kind: 'for_you'; score: number; publishedAt: string; id: string}

type FeedPage = {items: FeedPost[]; nextCursor: string | null}
type PostDetail = FeedPost & {comments: CommentPage}
type NotificationPage = {items: Notification[]; nextCursor: string | null}

type CreateHumanComment = {body: string; parentCommentId?: string}
type CreateIpInput = {username: string; displayName: string; bio?: string; languageCodes?: string[]}
type CreatePostInput = {ipProfileId: string; body: string; languageCode?: string}
type CreateIpCommentInput = {ipProfileId: string; body: string; parentCommentId?: string}
```

Responses project only safe public fields: post/id/body/language/published time, public IP card, verified public-media delivery URLs when they exist, derived real counts, and viewer booleans (`viewerHasLiked`, `viewerHasBookmarked`, `viewerFollowsAuthor`) only for a verified viewer. A comment response omits a deleted body and represents the preserved node as `{state: 'deleted'}`. Notifications expose IDs, kind, actor public card if still visible, target IDs, timestamps, and `readAt`; no private relationship/audit data.

Encode `Cursor` as base64url UTF-8 JSON, validate it strictly, and return `400 INVALID_CURSOR` for malformed, version-mismatched, or feed-kind-mismatched values. `limit` defaults to 25 and is constrained to 1..50. Empty pages return `{items: [], nextCursor: null}`.

## Delivery sequence

### 1. Land the database seam before routes

**Depends on:** the in-progress, currently untracked `packages/db/migrations/202609010003_social_core.sql`, its focused RLS test, and matching Drizzle exports. It must pass migration/RLS review before routes depend on it.

Implement `packages/db/src/social.ts` against the schema proposal in `.superpowers/sdd/social-core-preflight.md`:

```ts
type SocialRepository = {
  listFeed(input: {viewer: Actor | null; kind: FeedKind; locale?: Locale; limit: number; after: Cursor | null}): Promise<FeedPage>
  getPost(input: {viewer: Actor | null; postId: string; commentLimit: number; commentAfter: CommentCursor | null}): Promise<PostDetail | null>
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

type PlatformSocialRepository = {
  createIp(input: {operatorProfileId: string; requestId: string; ip: CreateIpInput}): Promise<PublicIp>
  publishPost(input: {operatorProfileId: string; requestId: string; post: CreatePostInput}): Promise<FeedPost>
  publishIpComment(input: {operatorProfileId: string; requestId: string; postId: string; comment: CreateIpCommentInput}): Promise<PublicComment>
}
```

Use database `INSERT ... ON CONFLICT DO NOTHING RETURNING` / `DELETE ... RETURNING` for idempotent relationship commands. Emit a notification only when the relationship/comment was newly created and recipient differs from actor; the same transaction writes it. `unlike`/`unfollow`/`unbookmark` do not manufacture a missing action. A target that is not public/published is `404`; RLS/ownership denial is mapped to a typed `403 FORBIDDEN` without exposing SQL details.

For Following, query only published IP posts from followed public IP profiles ordered `(published_at DESC, id DESC)`. For You is public and deterministic: `recency + real engagement + locale match + relationship + ip.feed_weight`, with the exact score formula documented in code and query tests; order `(score DESC, published_at DESC, id DESC)`. Both use tuple predicates matching the cursor. Do not introduce recommendation tables or mock fallbacks.

`createIp`, `publishPost`, and `publishIpComment` use the platform session and check the internal operator profile matches an active `profile_roles` membership in the same transaction. `publishPost` initially permits nonblank text and **no media rows**. It must create/update an immutable IP identity revision as needed, transition `draft -> published`, audit `ip_created`/`post_published`/`ip_comment_published`, and record corresponding closed-schema business events. Human comment creates `comment_created`; follow and post-like create `follow_created` / `post_liked` events only on first insertion. Add event types before invoking the helper.

Tests: exact tie/order/cursor continuation; public anonymous For You; unauthenticated Following/commands are rejected; no inactive/draft/withdrawn data; count/viewer projection uses actual rows; atomic rollback leaves no post/comment/notification/history/event rows; all user mutations run through an actor session.

### 2. Public feed and detail routes

Implement this before authenticated interactions:

```text
GET /v1/feed?kind=for_you|following&limit=1..50&cursor=...&locale=en|zh-CN
GET /v1/posts/:postId?commentLimit=1..50&commentCursor=...
```

`for_you` accepts anonymous callers (`viewer: null`). `following` requires verified auth and a derived human account; return `401 AUTH_REQUIRED` for missing credentials, `401 AUTH_INVALID` for bad/blank identities, and `503 AUTH_NOT_CONFIGURED` / `503 SOCIAL_NOT_CONFIGURED` when dependencies are absent. Detail is public for published content; its viewer flags are optional. Return `404 POST_NOT_FOUND` for missing, withdrawn, or hidden posts so publication state is not leaked.

Add route tests for request IDs, unknown query rejection, the empty feed/detail-not-found behavior, user-specific flags derived solely from auth, and cursor errors. This can land before R2 because text-only published posts are valid.

### 3. Human relationship, bookmark, and notification routes

Implement with a single `requireHumanActor` helper in `apps/api/src/routes/social.ts`; it calls `AuthVerifier`, provisions/loads the human profile as `/v1/me` does, and passes only `{subject}` to the port.

```text
PUT    /v1/profiles/:profileId/follow
DELETE /v1/profiles/:profileId/follow
PUT    /v1/posts/:postId/like
DELETE /v1/posts/:postId/like
PUT    /v1/posts/:postId/bookmark
DELETE /v1/posts/:postId/bookmark
GET    /v1/bookmarks?limit=1..50&cursor=...
GET    /v1/notifications?limit=1..50&cursor=...
POST   /v1/notifications/:notificationId/read
```

Use `200 {created: boolean}` or `200 {deleted: boolean}` for idempotent toggles; never use client-provided profile IDs as actors. The route has no API for other users' bookmarks. `POST .../read` returns `404 NOTIFICATION_NOT_FOUND` for absent/non-owned data and is idempotent when already read. Test that an ordinary human cannot forge a different actor through body/path values, bookmarks never appear in feed/detail counts, recipient-only reads work, and failure bodies stay typed/redacted.

### 4. Human comments and one-level replies

```text
POST /v1/posts/:postId/comments
       body: {body, parentCommentId?}
```

Require the derived human actor. The port strips source/operator fields by construction and uses social-core RLS plus same-post/depth checks. Return `201` with the public comment projection. Map invalid text, parent-on-another-post, and over-depth replies to `422 COMMENT_INVALID`; map unpublished/missing post to `404 POST_NOT_FOUND`. Comment/parent ordering is stable `(created_at, id)` with a separately validated comment cursor on the detail endpoint. Test human-only authorship, same-post rule, max one reply level, self-notification suppression, and atomic notification/history writes.

### 5. Operator commands (admin caller only)

Until `apps/admin` exists, put these behind an explicitly named admin route module, not a public UI route. They are callable only by an authenticated session whose derived current account is human **and** `AuthorityRepository.isCurrentActorOperator({subject})` returns true:

```text
POST /v1/admin/ips
       body: {username, displayName, bio?, languageCodes?}
POST /v1/admin/posts
       body: {ipProfileId, body, languageCode?}
POST /v1/admin/posts/:postId/comments
       body: {ipProfileId, body, parentCommentId?}
```

`requireOperator` derives `operatorProfileId` from the verified session, passes `c.get('requestId')`, and gives the clean input to `PlatformSocialRepository`; it does not trust an operator profile ID from any HTTP field. Return `403 OPERATOR_REQUIRED` before any platform DB work for a non-operator. Return `409 IP_NOT_PUBLISHABLE` for a non-public/paused IP or disabled operation; `422` for invalid request/body/thread; `409` for invalid state transition. Every successful command is transactionally auditable and uses source `admin`.

Route tests must prove a human cannot reach platform writes, a verified operator is represented by the requested IP but audited as themselves, no operator ID is exposed in a response, and a failed history/event write rolls back the visible social row. Add database integration coverage for source/author/operator invariants; an API mock alone is insufficient.

### 6. R2 media is a follow-on, not a prerequisite for social launch

Do **not** add `mediaUrls` to `POST /v1/admin/posts` yet. The social schema allows text-only posts, so Steps 1--5 can land before R2.

When the R2 asset metadata/verification slice exists, add a server-side `AssetPort` and a media reference input containing only approved asset IDs. The platform repository resolves IDs to verified, platform-owned image objects, creates `post_media` in the same publish transaction, and exposes delivery URLs only from public-safe projection code. The future API owns signed upload issuance/completion verification; browser clients never choose object keys or submit arbitrary URLs. Add 1..4 image, type, ownership, failed-upload, and publish atomicity tests then.

## Blockers (only)

1. **Social-core migration is not yet landed.** The in-progress `packages/db/migrations/202609010003_social_core.sql` and `packages/db/tests/social-core-rls.test.ts` are untracked; `packages/db/src/social.ts` does not exist. Routes must wait for the reviewed SQL/RLS contract rather than recreating its checks in Hono.
2. **Platform credential/session boundary is unimplemented.** `.env.example` names `DATABASE_PLATFORM_URL`, but `packages/db/src/session.ts` validates only user/admin URLs and no non-owner platform pool exists. Operator commands must not use `DATABASE_ADMIN_URL`; provision a least-privilege non-`BYPASSRLS` login and wire it into the new platform session first.
3. **History helper allow-lists presently permit only `operator_granted` / `account_registered`.** Add closed Zod contracts for the listed social audit/business events before any social platform command calls `createHistoryRepository`.
4. **R2 asset metadata/verification does not exist.** This blocks image-media publishing only, not public feeds, text-only manual posts, relationships, comments, or notifications.
