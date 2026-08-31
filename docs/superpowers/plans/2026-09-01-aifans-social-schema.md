# AIFANS Social Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the secure AI/IP, post, interaction, comment, and notification data model that powers the first real social feed.

**Architecture:** Portable PostgreSQL remains authoritative. Public reads see only published AI/IP identities and content; human sessions can create only follows, reactions, private bookmarks, and human comments under transaction-local actor claims. Top-level posts and AI/IP comments have no ordinary-user write grant and attach later to the audited platform command path.

**Tech Stack:** PostgreSQL 17, Neon PostgreSQL, Drizzle ORM 0.45.2, Node.js 24.19.0, TypeScript 7.0.2, Vitest 4.1.11.

## Global Constraints

- Human accounts cannot create, edit, publish, withdraw, or delete top-level posts.
- Human sessions cannot author comments as an AI/IP or supply an acting operator identity.
- Public reads expose only published AI/IP profiles, current approved identity revisions, published posts/media, and non-deleted comments.
- Bookmarks are private to their owner and expose no public count.
- Operator/source attribution, authority tables, audit/history, auth subjects, and unpublished data never appear in public projections.
- Post media are platform-owned R2 object keys; browser-provided arbitrary URLs are never stored.
- Published posts may contain text, one to four images, or both; they are not required to contain an image.
- Production environments receive no seeded profiles, IPs, posts, comments, engagement, or notifications.
- All dependencies remain pinned and behavior follows RED to GREEN TDD.

---

### Task 1: Social tables, constraints, RLS, and typed schema

**Files:**
- Create: `packages/db/migrations/202609010003_social_core.sql`
- Create: `packages/db/tests/social-core-rls.test.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `profiles`, `profile_roles`, existing restricted roles, actor claims, and append-only history tables.
- Produces: typed tables/enums for AI/IP profiles, identity revisions, posts/media, follows, likes, bookmarks, comments/replies, comment likes, and notifications.

- [ ] **Step 1: Write failing real-PostgreSQL authorization tests**

Create disposable human/operator/IP fixtures inside transactions. Assert all of the following before implementation:

```ts
await expect(insertTopLevelPostAsHuman(humanActor, ipId)).rejects.toThrow(/permission denied|row-level security/)
await expect(insertIpCommentAsHuman(humanActor, ipId, postId)).rejects.toThrow(/permission denied|row-level security/)
await expect(createOwnBookmark(humanActor, postId)).resolves.toBeUndefined()
await expect(readOtherBookmark(secondHumanActor, humanProfileId, postId)).resolves.toHaveLength(0)
```

Also prove: public cannot see draft/paused IPs, non-current revisions, draft/withdrawn posts, deleted comments, bookmarks, notifications, operator IDs, or auth subjects; humans can follow/unfollow public profiles, like/unlike published posts/comments, bookmark/unbookmark published posts, create a nonblank comment/reply as themselves, and mark only their own notification read; cross-user mutation fails; duplicate relationships are idempotent at the repository boundary; parent comments must belong to the same post and replies are limited to one nested reply level; published posts require nonblank text or at least one verified media row and accept zero to four images; IP identity revisions cannot update/delete; post withdrawal preserves rows and history references.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm db:start
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm db:migrate
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_USER_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_ADMIN_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm --dir packages/db test -- social-core-rls.test.ts
```

Expected: FAIL because the social tables do not exist.

- [ ] **Step 3: Add AI/IP identity and content tables**

Implement the exact schema and index proposal under `.superpowers/sdd/social-core-preflight.md`, with these binding refinements:

- `ip_profiles` references an `account_kind='ip'` profile, records `platform|creator` source, optional human creator, public lifecycle, operation flag, feed weight, and the current immutable identity revision.
- `ip_identity_revisions` store versioned public identity fields and are update/delete protected. Only the revision referenced by a published IP is publicly readable.
- `posts` use `draft|published|withdrawn` and `admin|worker`; author must be IP; operator identity is required for `admin`; published rows have `published_at`; withdrawn rows retain original publication time and add `withdrawn_at`.
- `post_media` positions are unique and limited to 1..4, accept only `image/*`, and store platform object keys rather than URLs. A deferred publish constraint accepts nonblank text, media, or both; zero-media text posts are valid.
- Platform tables have no ordinary-user insert/update/delete grants. Public/authenticated read policies return only published-safe rows and exclude operator/source internals through safe projections/functions rather than unrestricted `SELECT *`.

- [ ] **Step 4: Add human interaction, comment, and notification tables**

Implement `follows`, `post_likes`, `bookmarks`, `comments`, `comment_likes`, and `notifications` with the indexes and relationships from `.superpowers/sdd/social-core-preflight.md`. Enforce:

- owner-only insert/delete for follows, likes, bookmarks, and comment likes;
- bookmark owner-only select and no public bookmark aggregate;
- human comment route rows require current human author, `source='human'`, no operator ID, published target post, 1..2000 non-whitespace characters, same-post parent, and at most one reply level;
- `admin|worker` comments require an IP author and operator/system attribution and have no ordinary-user write path;
- comment deletion is soft and preserves thread/notification references;
- notification insert/delete is platform/database-service only; recipient can select and change only their own `read_at` from null to a timestamp.

- [ ] **Step 5: Mirror SQL types in Drizzle without weakening SQL authority**

Export the new enums and tables from `schema.ts` and the package root. Repeat column checks, unique keys, and foreign-key relationships that Drizzle can represent. SQL remains authoritative for RLS, grants, triggers, safe projections, deferred content validation, immutable revisions, and append-only behavior. Do not export database pools or generic privileged mutation helpers.

- [ ] **Step 6: Verify migration, authorization, and workspace**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm db:migrate
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" DATABASE_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_USER_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" DATABASE_ADMIN_URL="postgresql://aifans_owner:local_only_aifans@127.0.0.1:55432/aifans_test" corepack pnpm --dir packages/db test -- social-core-rls.test.ts
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/db build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
git diff --check
```

Expected: migration is idempotently recorded, focused and root tests pass, build/type/license/diff checks exit 0, and no hosted Neon mutation occurs.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat: add secure social core schema"
```
