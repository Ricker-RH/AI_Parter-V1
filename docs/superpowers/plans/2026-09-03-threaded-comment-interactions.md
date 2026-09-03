# Threaded Comment Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every public comment the same four reliable interaction capabilities as a post while presenting replies as flat, always-expanded Threads-style root groups.

**Architecture:** Preserve the exact reply target in `parent_comment_id` and denormalize the immutable group owner into `root_comment_id`. Read and paginate whole root groups, render all group members at one horizontal level with an avatar connector rail, and reuse generic action-state primitives through post and comment adapters. All mutations remain server-authoritative, idempotent, RLS-scoped, and reversible in the UI.

**Tech Stack:** PostgreSQL migrations/RLS/commands, Drizzle schema, Zod contracts, Hono API, Next.js/React, CSS, Vitest, PostgreSQL integration tests, Playwright.

---

### Task 1: Thread identity, interaction storage, and database commands

**Files:**
- Create: `packages/db/migrations/202609030003_threaded_comment_interactions.sql`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/social.ts`
- Modify: `packages/db/tests/social-core-rls.test.ts`
- Modify: `packages/db/tests/social-repository.test.ts`
- Modify migration ledger/tests where required by the existing migration runner

- [ ] Add RED database tests for existing-row backfill, root self-identity, arbitrary-depth direct parents in the same published post, cross-post/deleted-parent rejection, immutable root identity, root tombstones, comment like/bookmark/share ownership and idempotency, and concurrent lock ordering.
- [ ] Add `comments.root_comment_id`, backfill roots and existing replies, enforce same-post root consistency, derive root from the parent in guarded commands, and replace the one-reply-level rule without allowing clients to choose a forged root.
- [ ] Reuse `comment_likes`; add `comment_bookmarks` and an idempotent `comment_share_events` ledger with indexes, grants, RLS, and hidden/deleted-target protection mirroring post mutations.
- [ ] Add bounded SECURITY DEFINER comment interaction commands and repository methods. Run database migration, RLS, repository, concurrency, and schema tests GREEN.

### Task 2: Public thread projection and API contracts

**Files:**
- Modify: `packages/contracts/src/social.ts`
- Modify: `packages/contracts/src/social.test.ts`
- Modify: `apps/api/src/ports/social.ts`
- Modify: `apps/api/src/routes/social.ts`
- Modify: `apps/api/src/routes/social.test.ts`
- Modify: `packages/db/src/social.ts`
- Modify corresponding database projection migration/tests

- [ ] Add RED contract tests requiring each published comment to expose `rootCommentId`, `likeCount`, direct `replyCount`, `bookmarkCount`, `shareCount`, optional authenticated `viewerHasLiked/viewerHasBookmarked`, and a strict root-thread page shape.
- [ ] Replace flat comment pagination with immutable root `(created_at,id)` keyset pagination and bounded continuation that never duplicates or loses a root group. Keep roots and replies chronological and always expanded; preserve a deleted root as a body-less tombstone when published descendants exist.
- [ ] Add RED API tests for PUT/DELETE `/v1/comments/:commentId/like`, PUT/DELETE `/bookmark`, and POST `/share`; enforce empty query/body rules, UUIDs, auth where required, anonymous share support, UUID idempotency key, strict responses, and non-leaking 404s.
- [ ] Implement minimal ports/routes/projections and run contract, DB, and API suites GREEN. Ensure one post-detail response uses a consistent database snapshot for post counts and comment threads.

### Task 3: Shared action engine and flat root-group UI

**Files:**
- Refactor: `apps/web/src/components/social/PostActions.tsx`
- Create: `apps/web/src/components/social/EntityActions.tsx` or a focused shared hook/controller plus adapters
- Create: `apps/web/src/components/social/CommentActions.tsx`
- Modify: `apps/web/src/components/social/PostDetailContent.tsx`
- Modify: `apps/web/src/components/social/CommentComposer.tsx`
- Modify: `apps/web/src/app/api/social/[...path]/route.ts` and tests only as needed for the new allowlisted comment mutations
- Modify locale messages and relevant component tests

- [ ] Add RED tests proving post interactions remain unchanged while comments support authoritative counts, optimistic like/bookmark updates, precise rollback, stale-operation isolation, auth return paths, share-success reporting, share-cancel no-op, and canonical `#comment-id` URLs.
- [ ] Extract only the reusable interaction controller/share helper; keep post and comment adapters responsible for entity-specific routes and capabilities.
- [ ] Render root-group wrappers with dividers only between roots. Render every reply at the same horizontal alignment, no folding and no per-row divider; draw the connector in the avatar rail.
- [ ] Give every root/reply its four actions. The comment action sets the shared composer target to that exact comment; show `Replying to @name` plus a cancel control, and restore post-target mode after cancel or successful publish.
- [ ] Keep `parentCommentId` exact while inserting the returned comment into its root group without losing server reconciliation. Run component and Web suites GREEN.

### Task 4: Responsive/product verification and deployment

**Files:**
- Add/modify focused Playwright specs under `tests/e2e/`
- Modify only implementation files required by review findings

- [ ] Verify 320/375/390/430/699/700/1184 layouts: aligned avatars/content/actions, connector continuity, dividers only between root groups, no folding, 44px targets, no horizontal overflow, and composer/nav non-overlap.
- [ ] Verify keyboard/focus/ARIA, reply target changes/cancel, browser back/deep comment anchors, dark/light tokens, share cancel/success, and final-comment visibility.
- [ ] Run full DB migration/integration tests, contracts/API/Web tests, all typechecks, production builds, E2E, and `git diff --check`.
- [ ] Perform independent specification review followed by code-quality review; fix every Critical/Important issue and rerun affected gates.
- [ ] Commit and push only `codex/ux-slice-0-1`, deploy API before Web, wait for exact commit success, then verify the branch alias and real logged-in interaction paths.
