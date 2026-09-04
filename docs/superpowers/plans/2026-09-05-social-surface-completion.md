# Social Surface Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining share, profile-cache, avatar-navigation, and unread-state behaviours from the approved social-surface specification.

**Architecture:** Keep visual policy in shared Web components. Use the existing human-chat API as the authority for mutual-recipient selection and send eligibility; retain client drafts on rejection. Add client query shells only where server-rendered profile pages cannot reuse intent-prefetched data. Add IP-conversation read state at the chat persistence layer rather than fabricate unread numbers in the UI.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Vitest, Zod contracts, Hono API, PostgreSQL migrations.

---

### Task 1: Make IP sharing sendable and recipient-complete

**Files:**
- Modify: `apps/web/src/components/social/IpProfileShareAction.tsx`
- Modify: `apps/web/src/components/social/IpProfileShareAction.test.tsx`
- Modify if recipient card data needs an avatar: `packages/contracts/src/human-chat-rich-content.ts`, `packages/db/migrations/*`, `packages/db/src/human-chat-rich-content.ts`

- [ ] Write tests that prove a share message is sent to `/api/human-chat/peers/:profileId/messages`, a mutual recipient who has no earlier conversation is selectable, and rejected sends preserve the selected recipient and note.
- [ ] Run the targeted test and confirm it fails against the old conversation-only lookup and invalid message path.
- [ ] Use `/api/human-chat/share-targets?kind=human` for recipients; send optional text and IP rich content through the peer route; add the four required actions and localized empty/rejection copy.
- [ ] Run the targeted test and commit the focused change.

### Task 2: Reuse profile data through full-page navigation and make detail avatars navigable

**Files:**
- Modify: profile cache/route components under `apps/web/src/components/profile/`
- Modify: `apps/web/src/app/[locale]/profiles/[profileId]/page.tsx` and `apps/web/src/app/[locale]/humans/[profileId]/page.tsx` only if a client shell needs initial server fallback
- Modify: `apps/web/src/components/chat/HumanConversationDetail.tsx`
- Test: matching `*.test.tsx`

- [ ] Write tests that prove cached IP/human profile data renders while a revalidation request is in flight and that a human conversation-header avatar links to the peer profile.
- [ ] Run the tests and confirm the cache/navigation expectations fail before implementation.
- [ ] Introduce scoped cache keys that never reuse viewer-sensitive relationship state across accounts, use server data as the initial fallback, and add the header link.
- [ ] Run focused tests and commit.

### Task 3: Add real unread state for IP conversations

**Files:**
- Modify: chat contracts/API/database repository and migration for last-read state.
- Modify: Web conversation list and mobile unread badge.
- Test: contracts, repository/API route, conversation list, badge.

- [ ] Trace the existing AI/IP conversation persistence and write a failing contract/repository test for unread count and read advancement.
- [ ] Run it RED and confirm there is no existing persisted read state.
- [ ] Add a persisted per-viewer cursor, include `unreadCount` in the IP conversation summary, mark it read on opening, and sum both IP and human counts in the mobile badge.
- [ ] Run database/API/Web tests and commit.

### Task 4: Verify and release

**Files:** none unless a failing regression test identifies a defect.

- [ ] Run Web tests, typecheck, production build, and focused API/database tests.
- [ ] Review the diff to ensure no user-owned dirty files are staged.
- [ ] Deploy Web and API changes in dependency order, then smoke-test the preview in desktop, mobile Safari, installed-PWA, light, and dark modes.
