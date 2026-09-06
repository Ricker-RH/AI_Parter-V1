# Chat App Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make human conversations feel like a stable mobile chat surface, with fixed chrome, clear identity and message metadata, direct voice sending, and focused attachment actions.

**Architecture:** Keep the existing conversation, presence, upload, and realtime APIs unchanged. Improve only the rendered conversation shell and media interaction components: the detail pane owns the fixed header/composer and scrollable history; media controls own capture/send; media messages own compact playback.

**Tech Stack:** Next.js, React, TypeScript, TanStack Query, Vitest, Testing Library, CSS Modules.

---

### Task 1: Conversation identity and message metadata

**Files:**
- Modify: `apps/web/src/components/chat/HumanConversationDetail.tsx`
- Modify: `apps/web/src/components/chat/ConversationDetail.tsx`
- Modify: `apps/web/src/components/chat/MessagesWorkspace.module.css`
- Test: `apps/web/src/components/chat/HumanConversationDetail.test.tsx`

- [ ] **Step 1: Write a failing render test** that asserts the header uses an icon-only back control, does not expose the account handle, and that inbound/outbound messages render avatars and times.
- [ ] **Step 2: Run the focused Vitest file** with `pnpm -C apps/web exec vitest run src/components/chat/HumanConversationDetail.test.tsx`; expect assertions to fail on the current header and message rows.
- [ ] **Step 3: Render a compact identity header** with a confirmed-only Online label, and add avatar/time/status elements to each message row.
- [ ] **Step 4: Make the header and composer grid siblings of a `minmax(0, 1fr)` scroll area** and style incoming/outgoing metadata without introducing document scrolling.
- [ ] **Step 5: Re-run the focused test**; expect PASS.

### Task 2: Direct hold-to-send voice

**Files:**
- Modify: `apps/web/src/components/chat/HumanMediaControls.tsx`
- Modify: `apps/web/src/components/chat/HumanMediaControls.test.tsx`

- [ ] **Step 1: Change the existing held-recording test** to expect upload/send after pointer release, with no `Send attachment` preview action.
- [ ] **Step 2: Run the focused test** with `pnpm -C apps/web exec vitest run src/components/chat/HumanMediaControls.test.tsx`; expect the old preview behavior assertion to fail.
- [ ] **Step 3: Send the captured voice blob from `MediaRecorder.onstop` when release did not cancel it**, retaining the existing authenticated upload, idempotency ID, validation, and abort behavior.
- [ ] **Step 4: Add pointer-move cancellation feedback and use release-to-send/upward-cancel labels**, leaving image preview-and-confirm behavior intact.
- [ ] **Step 5: Re-run the focused test**; expect PASS.

### Task 3: Compact voice playback and attachment panel

**Files:**
- Modify: `apps/web/src/components/chat/HumanMediaMessage.tsx`
- Modify: `apps/web/src/components/chat/HumanMediaMessage.test.tsx`
- Modify: `apps/web/src/components/chat/HumanRichComposer.tsx`
- Modify: `apps/web/src/components/chat/MessagesWorkspace.module.css`

- [ ] **Step 1: Write failing assertions** for a labelled custom Play voice control and a two-action, four-column mobile attachment grid without Share.
- [ ] **Step 2: Run the focused Vitest files** for media messages and rich composer; expect the native audio controls / share action assertions to fail.
- [ ] **Step 3: Replace native visible audio controls with a semantic compact bubble** that plays, stops, reports duration/progress, and preserves expired-URL renewal.
- [ ] **Step 4: Remove the Share entry point from the more panel, retain image and camera, and make the grid four equal slots on mobile.**
- [ ] **Step 5: Re-run the focused tests**; expect PASS.

### Task 4: Regression validation and release

**Files:**
- Modify: only files changed in Tasks 1–3 if validation reveals an issue

- [ ] **Step 1: Run the chat component test suite** with `pnpm -C apps/web exec vitest run src/components/chat`.
- [ ] **Step 2: Run `pnpm -C apps/web typecheck` and the production build** with the existing local signing secret and isolated Next build directory.
- [ ] **Step 3: Visually inspect desktop and mobile conversation routes** for fixed header/composer, safe-area padding, attachment grid, and no long account ID.
- [ ] **Step 4: Commit only the chat UI files and this plan, push the existing branch, deploy the web app, and verify the deployed route returns HTTP 200.**
