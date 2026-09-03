# Unified Messages and Notifications Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn chats and notifications into one responsive, deep-linkable master-detail Messages workspace, with contextual notification details and automatic read state.

**Architecture:** Keep chat and notification domain components separate behind a shared two-pane workspace frame. Canonical notification routes live under `/[locale]/messages/notifications[/notificationId]`; the legacy `/[locale]/notifications` URL redirects into the workspace. A recipient-scoped single-notification API makes notification detail deep links stable even when the item is outside the currently loaded list page.

**Tech Stack:** Next.js App Router, React, CSS Modules, Hono, PostgreSQL repository/ports, Zod contracts, Vitest and Testing Library.

---

### Task 1: Recipient-scoped notification detail contract and API

**Files:**
- Modify: `packages/contracts/src/social.ts`
- Modify: `packages/contracts/src/social.test.ts`
- Modify: `apps/api/src/ports/social.ts`
- Modify: `packages/db/src/social.ts`
- Modify: `packages/db/tests/social-repository.test.ts`
- Modify: `apps/api/src/routes/social.ts`
- Modify: `apps/api/src/routes/social.test.ts`

- [ ] **Step 1: Write failing contract, repository, and route tests**

Add tests proving `GET /v1/notifications/:notificationId` returns the existing strict `NotificationSchema`, rejects malformed UUIDs, returns 404 for absent or another recipient's notification, and never leaks another user's notification. Add repository coverage for the same owner scope and actor projection.

- [ ] **Step 2: Run tests and verify RED**

Run the focused contract, repository, and API route tests. Expected: failures because `getNotification` and the detail route do not exist.

- [ ] **Step 3: Implement the minimal owner-scoped read**

Extend the social port with `getNotification(actor, notificationId): Promise<Notification | null>`. Query through the existing actor-scoped transaction/RLS path, project the exact `NotificationSchema` shape, validate the route UUID, return the standard 404 envelope for unavailable records, and parse the successful response with `NotificationSchema`.

- [ ] **Step 4: Run focused and neighboring suites and verify GREEN**

Run contract tests, database social repository tests, and API social route tests. Expected: all pass with no warnings.

- [ ] **Step 5: Commit the API slice**

Commit only the contract/port/repository/API files with `feat(api): add notification detail read`.

### Task 2: Web data access and canonical workspace routes

**Files:**
- Modify: `apps/web/src/lib/social-api.ts`
- Test: `apps/web/src/lib/social-api.test.ts`
- Create: `apps/web/src/app/[locale]/messages/notifications/page.tsx`
- Create: `apps/web/src/app/[locale]/messages/notifications/[notificationId]/page.tsx`
- Create corresponding route tests beside each page
- Modify: `apps/web/src/app/[locale]/notifications/page.tsx`
- Modify: `apps/web/src/app/[locale]/notifications/page.test.tsx`
- Modify: `apps/web/src/components/shell/route-shell.ts`
- Modify: `apps/web/src/components/shell/route-shell.test.ts`
- Modify: `apps/web/src/app/[locale]/layout.tsx`

- [ ] **Step 1: Write failing web API and route tests**

Prove the detail fetch validates `NotificationSchema`; canonical list and detail routes preserve authentication return paths and cursors; old `/notifications` redirects to `/messages/notifications`; and every nested notification URL resolves to the Messages shell.

- [ ] **Step 2: Run focused tests and verify RED**

Expected failures: canonical route modules and detail fetch do not exist, legacy route still renders a page, and shell matching does not cover the new tree.

- [ ] **Step 3: Implement canonical routes and compatibility redirect**

Add `fetchNotification`, render canonical routes through the shared workspace component from Task 3, keep pagination query parameters, and redirect the legacy entry without discarding its cursor.

- [ ] **Step 4: Run focused route/access tests and verify GREEN**

Run social API, notification page, access policy, route-shell, root locale sync, and layout tests.

### Task 3: Shared responsive master-detail UI

**Files:**
- Create: `apps/web/src/components/chat/InboxWorkspaceFrame.tsx`
- Create: `apps/web/src/components/chat/NotificationList.tsx`
- Create: `apps/web/src/components/chat/NotificationDetail.tsx`
- Create tests beside each component
- Modify: `apps/web/src/components/chat/MessagesSectionHeader.tsx`
- Modify: `apps/web/src/components/chat/MessagesWorkspace.tsx`
- Modify: `apps/web/src/components/chat/ConversationList.tsx`
- Modify: `apps/web/src/components/chat/MessagesWorkspace.module.css`
- Modify: `apps/web/src/components/social/NotificationReadButton.tsx`
- Modify related component tests and locale message dictionaries

- [ ] **Step 1: Write failing behavior tests**

Cover chat/notification tabs targeting canonical URLs, desktop list plus detail, notification selection with `aria-current`, automatic idempotent mark-read only after a valid detail renders, optimistic rollback and accessible error on failure, notification target context links, mobile back targets preserving cursor, and empty/unavailable states isolated to their pane.

- [ ] **Step 2: Run component tests and verify RED**

Expected failures must identify missing workspace/list/detail behavior rather than setup errors.

- [ ] **Step 3: Implement domain-separated components behind one frame**

Use the existing 700px breakpoint and shell tokens. At 700px and above render a 300–380px left pane and flexible right pane with independent vertical scrolling. Below 700px show only the list when no item is selected and only detail when selected. Preserve semantic links, focus-visible styles, headings, non-color unread text, and touch targets of at least 44px. Render post/comment notifications as target-content context links and follow notifications as actor/profile context; do not duplicate the list row as the entire detail.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run all chat, notification, shell navigation, loading, and locale tests.

- [ ] **Step 5: Verify responsive CSS contracts**

Add source-level assertions for the 700px breakpoint, no horizontal scrolling, mobile pane hiding rules, safe-area padding, focus-visible states, and 44px controls; run them green.

### Task 4: Integration, review, and deployment verification

**Files:**
- Modify only files required by review findings

- [ ] **Step 1: Run full fresh verification**

Run web/API typechecks, all relevant unit/integration tests, production builds, `git diff --check`, and repository status checks.

- [ ] **Step 2: Perform specification review**

Verify canonical routes, legacy compatibility, contextual detail, auto-read, owner scoping, responsive behavior, accessibility, and error isolation against the approved design.

- [ ] **Step 3: Perform code-quality review**

Check duplication, data-fetch waterfalls, abort/stale-response handling, accessibility, semantic tokens, route/cache correctness, and test quality. Fix every material issue and rerun affected tests.

- [ ] **Step 4: Commit and push only the feature branch**

Push `codex/ux-slice-0-1`; do not change or push `main`.

- [ ] **Step 5: Verify the deployed product**

Wait for exact-commit Vercel success, confirm the branch alias points to that immutable deployment, then test chat/notification switching and desktop/tablet/mobile list-detail behavior in the deployed app. Verify no application console errors. Perform the real share mutation only after action-time confirmation.
