# Latest-first Social Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply stable latest-first ordering to recency-based content and root comments while preserving ranked recommendations and chronological replies.

**Architecture:** Versioned contracts define keyset cursor semantics. The repository joins viewer actions for liked/saved lists and delegates root-group ordering to a forward-migrated SQL function. Client optimistic insertion mirrors server order.

**Tech Stack:** TypeScript, Zod, PostgreSQL, React, Vitest

---

### Task 1: Version cursor contracts

**Files:**
- Modify: `packages/contracts/src/social.ts`
- Test: `packages/contracts/src/social.test.ts`

- [ ] Write failing tests for `root_created_at_desc_v1` comment cursors and `saved_at_desc_v1` saved cursors.
- [ ] Run the contract test and confirm it rejects the new values.
- [ ] Add strict schemas plus canonical encode/decode helpers.
- [ ] Run the contract test and confirm it passes.

### Task 2: Implement database ordering

**Files:**
- Create: `packages/db/migrations/202609030004_latest_first_social_ordering.sql`
- Modify: `packages/db/src/social.ts`
- Test: `packages/db/tests/social-repository.test.ts`

- [ ] Write failing repository tests proving saved actions and root groups are descending across cursor pages while replies are ascending.
- [ ] Run the database test and confirm the current order fails.
- [ ] Add the forward-only comment projection migration and saved-action join/cursor query.
- [ ] Run migrations and repository tests; confirm no duplicate or missing records.

### Task 3: Mirror ordering in the Web and API

**Files:**
- Modify: `apps/api/src/routes/social.ts`
- Test: `apps/api/src/routes/social.test.ts`
- Modify: `apps/web/src/components/social/PostDetailContent.tsx`
- Test: `apps/web/src/components/social/SocialContent.test.tsx`

- [ ] Write failing tests for saved-cursor validation and new-root optimistic placement.
- [ ] Validate saved cursors at the HTTP boundary and prepend optimistic root groups.
- [ ] Keep replies appended to their group and loaded older root pages appended after newer groups.
- [ ] Run focused API and Web tests.

### Task 4: Verify and deploy

**Files:**
- Test: all files above

- [ ] Run contract, API, Web, and database suites plus type checks and production builds.
- [ ] Apply the migration to the test database before deploying API and Web.
- [ ] Push the branch, wait for both Vercel projects, and verify ordering through Preview API and UI.
