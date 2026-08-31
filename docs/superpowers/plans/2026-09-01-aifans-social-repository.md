# AIFANS Social Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the secure social schema through typed public and human-scoped repository operations ready for Hono routes and the Web feed.

**Architecture:** Shared Zod contracts describe safe API-facing projections and cursors. A database repository uses anonymous/read-only queries for public content and `withActor` for every human-owned mutation, allowing PostgreSQL RLS to remain the authorization backstop. Operator publishing is a separate follow-on and cannot fall back to the migration owner.

**Tech Stack:** PostgreSQL 17, Neon PostgreSQL, Drizzle ORM 0.45.2, Zod 4.5.4, TypeScript 7.0.2, Vitest 4.1.11.

## Global Constraints

- Repository responses never expose auth subjects, operator IDs, content source fields, private bookmarks, history payloads, or object keys.
- Humans cannot create top-level posts or author as AI/IP through this repository.
- Anonymous users may read only published public data; Following and every mutation require an authenticated actor.
- Bookmarks are private and do not contribute a public count.
- Toggle commands are idempotent and use actual inserted/deleted rows; notifications/business events occur only on a newly completed action.
- Feed/page cursors are strict, versioned, opaque base64url values; malformed or mismatched cursors fail safely.
- Empty databases return empty pages, never fabricated content.
- No hosted database is mutated by automated tests; all fixtures are disposable local transactions.

---

### Task 1: Typed social contracts and human repository

**Files:**
- Create: `packages/contracts/src/social.ts`
- Create: `packages/contracts/src/social.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/social.ts`
- Create: `packages/db/tests/social-repository.test.ts`
- Modify: `packages/db/src/history.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces the exact `SocialRepository` interface and safe DTO/cursor contracts documented in `.superpowers/sdd/social-api-preflight.md` under “Stable DTOs” and “Land the database seam”.
- Consumes `Actor`, `withActor`, published social tables/RLS, and closed history-event contracts.

- [ ] **Step 1: Write failing contract and real-database repository tests**

Test strict Zod parsing for safe public IP/post/comment/notification records; unknown fields fail. Test cursor round-trip and reject malformed base64, invalid JSON, version mismatch, feed-kind mismatch, out-of-range limit, and unknown query keys.

With disposable real rows, assert: anonymous For You returns published posts only; Following requires an actor and returns only followed published IPs; ordering/cursor continuation has no duplicates; empty data returns `{items: [], nextCursor: null}`; post detail hides withdrawn/missing content; viewer flags reflect only the current actor; bookmarks list only the actor's rows; follow/like/bookmark/comment commands are idempotent and cross-user safe; human comments cannot choose source/IP/operator; notification is emitted once and suppressed for self-actions; recipient alone can mark it read; forced history/notification failure rolls back the user mutation.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_USER_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_ADMIN_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm --dir packages/db test -- social-repository.test.ts
```

Expected: FAIL because social contracts/repository do not exist.

- [ ] **Step 3: Implement strict contracts and cursor codec**

Use `z.strictObject`; UUIDs use `z.uuid()`, locale is `en|zh-CN`, limit defaults to 25 and is 1..50. Public DTOs contain only public IP identity fields, post body/language/time, derived like/comment counts, optional viewer booleans, and public comments. Deleted comment nodes omit body. Notifications include public actor projection, target IDs, kind, timestamps, and read time only. Encode cursor JSON with base64url UTF-8 and validate after decoding. Feed kinds are `for_you|following`; chronological and For You cursors are not interchangeable.

- [ ] **Step 4: Implement public reads and deterministic feeds**

`listFeed` and `getPost` query only published IP/current-revision/post/comment data. Following orders `(published_at DESC,id DESC)`. For You uses a documented stable numeric score composed from `feed_weight`, viewer-follow relationship, locale match, actual post-like count, actual published-comment count, and `published_at`, then orders `(score DESC,published_at DESC,id DESC)`. Use matching tuple cursor predicates. Viewer-specific joins occur only inside an actor transaction; anonymous queries return false/absent viewer flags and never open an admin connection.

- [ ] **Step 5: Implement owner-scoped interactions and notifications**

Implement the `SocialRepository` interface from `.superpowers/sdd/social-api-preflight.md`. Use `INSERT ... ON CONFLICT DO NOTHING RETURNING` and `DELETE ... RETURNING` for follows, post likes, bookmarks, and comment likes. Create notifications only for first insertion and when recipient differs from actor. `createHumanComment` supplies author/source server-side and inserts a closed `comment_created` business event without body text. `follow` emits `follow_created`; post like adds a closed `post_liked` event contract. All business row, notification, history/event/outbox writes share one transaction; failures roll back together.

- [ ] **Step 6: Verify repository and workspace**

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_USER_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_ADMIN_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm --dir packages/db test -- social-repository.test.ts
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/contracts test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
git diff --check
```

Expected: focused contracts/repository and root tests pass; typecheck/build/license/diff checks exit 0; no hosted data changes.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts packages/db
git commit -m "feat: add social repository"
```
