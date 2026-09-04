# Unified Social Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver consistent mobile social surfaces, profiles, inbox identity/unread treatment, and IP sharing without route-specific fixes.

**Architecture:** A shared surface primitives layer owns viewport, header, avatar and action-row presentation. Query keys retain cache-first records while route components only compose the primitives. The share sheet extends the existing human-chat content contract with a validated IP-card payload and keeps guest-only share actions entirely client-side.

**Tech Stack:** Next.js, React, TypeScript, TanStack Query, Vitest/Testing Library, CSS Modules, Zod contracts, pnpm.

---

## File map
- `apps/web/src/components/SectionSearchField.tsx` / `.module.css`: canonical search field geometry.
- `apps/web/src/components/chat/MessagesSectionHeader.tsx`, `MessagesWorkspace.module.css`, `NotificationList.tsx`: common Messages/Notifications header.
- `apps/web/src/components/channels/ChannelDirectory.tsx`, `ChannelPage.module.css`: channel reference geometry.
- `apps/web/src/components/social/SocialSurface.tsx` / `.module.css`, `apps/web/src/app/globals.css`, app shell/nav files: one mobile viewport and fixed navigation contract.
- `apps/web/src/components/account/Avatar.tsx` / `.module.css`, `HumanAvatar.tsx`: identity halo and navigation semantics.
- `apps/web/src/components/chat/ConversationList.tsx`, `HumanMessagesWorkspace.tsx`, navigation component: unread badges and human/IP rows.
- `apps/web/src/components/profile/*`: shared profile chrome, overflow actions, cache-first relationship display and editor upload states.
- `apps/web/src/components/social/EntityActions.tsx`, `PostActions.tsx`, `CommentActions.tsx`: common action row.
- `packages/contracts/src/human-chat.ts`, human-chat API/db routes, `HumanShareMessage.tsx`: IP-card share protocol.
- `apps/web/src/components/share/*`: themed bottom sheet and client share actions.

### Task 1: Lock down common surface primitives
- [ ] Write failing component/CSS tests for channel-equivalent Messages/Notifications header geometry, fixed mobile viewport, and retained content scroll.
- [ ] Run the focused tests and confirm they fail because Messages has no common layout contract.
- [ ] Extract shared spacing variables and apply them to channel, message and notification header composition; make the surface viewport own `100dvh`, safe-area offsets and `overflow: hidden`, with only its content child scrolling.
- [ ] Run focused tests and commit `feat(web): unify social surface headers`.

### Task 2: Identity and unread presentation
- [ ] Write failing tests for equal avatar box sizes, deterministic IP halo, no HUMAN text, conversation badge and aggregate bottom-nav badge.
- [ ] Run focused tests and confirm the current human row has type text/no unified badge.
- [ ] Add a typed avatar kind, deterministic color from identity ID, reduced-motion fallback, `UnreadBadge`, and aggregate selector from cached inbox data.
- [ ] Run focused tests and commit `feat(web): unify inbox identity and unread badges`.

### Task 3: Profile chrome and cache-first data
- [ ] Write failing tests for self/no-search header, human overflow Block, IP overflow Share, immediate follower count from cached profile, and direct avatar navigation outside author preview.
- [ ] Run focused tests and confirm missing/incorrect controls.
- [ ] Move profile top bar into a shared chrome component, route actions through an overflow menu, preserve variant body layouts, seed profile relation query with route cache, and lower backdrop overlay opacity.
- [ ] Run focused tests and commit `feat(web): standardize profile chrome and cached metadata`.

### Task 4: Editor and interaction consistency
- [ ] Write failing tests for editor title, stable preference state, in-preview upload spinner, and equal post/comment action metric.
- [ ] Run focused tests and confirm current standalone status/gap and divergent CSS metrics.
- [ ] Render editor title in canonical top bar, reserve preference region with retry in-place, move upload status into preview overlay, and make post/comment consume EntityActions layout tokens.
- [ ] Run focused tests and commit `feat(web): unify editor and interaction layouts`.

### Task 5: IP card share protocol and sheet
- [ ] Write failing contract/API/component tests for an IP share target, guest external actions, mutual-human recipient selection, optional note, no-recipient copy, and failed-send preservation.
- [ ] Run focused tests and confirm IP target is rejected by the existing post-only protocol.
- [ ] Extend Zod chat content target union with `ip`; validate target existence server-side; render `HumanShareMessage` IP cards; implement themed bottom sheet with recipient selection, note, send/copy/native/share-card actions and accessibility focus/dismissal.
- [ ] Run focused tests and commit `feat(web): add IP profile share sheet`.

### Task 6: Regression validation and preview deployment
- [ ] Run `pnpm test`, web typecheck, and production build with the local rate-limit signing secret.
- [ ] Fix any failing test at its layer before proceeding.
- [ ] Deploy the committed branch to Vercel preview and alias the branch preview URL.
- [ ] Verify mobile/desktop dark/light visual states without sending a real direct message.
