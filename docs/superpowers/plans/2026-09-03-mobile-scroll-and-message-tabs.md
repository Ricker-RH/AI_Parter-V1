# Mobile Scroll Clearance and Message Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent mobile content from being covered by fixed bottom UI and make Messages tabs visually identical across viewports without a bottom divider.

**Architecture:** Keep scroll-clearance rules in the shared social shell stylesheet and Messages tab rules in its scoped CSS module. Reuse CSS custom properties and shared base selectors instead of page-specific last-child patches or desktop overrides.

**Tech Stack:** Next.js 16, React 19, CSS Modules, global responsive CSS, Vitest, Playwright.

---

### Task 1: Mobile scroll clearance

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/social/SocialContent.test.tsx`
- Test: relevant responsive Playwright spec under `apps/web/e2e/`

- [ ] **Step 1: Write failing tests** asserting shared mobile bottom-clearance variables and distinct list/detail reserves, with no desktop tail reserve.
- [ ] **Step 2: Run the focused tests** and confirm they fail because the shared clearance contract is absent.
- [ ] **Step 3: Implement the minimal shared CSS** so feed/collection scrolling reserves bottom navigation, safe-area, and breathing room, while detail scrolling additionally reserves the fixed composer.
- [ ] **Step 4: Run focused Vitest and responsive Playwright checks** at 375/699/700/1024px and confirm final content is not obscured.
- [ ] **Step 5: Run `git diff --check`** and report modified files and evidence; do not commit or push.

### Task 2: Messages tab sizing and divider removal

**Files:**
- Modify: `apps/web/src/components/chat/MessagesWorkspace.module.css`
- Test: `apps/web/src/components/chat/ConversationList.test.tsx`
- Test: `apps/web/src/components/chat/NotificationsWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests** asserting no section-header/list bottom divider and one cross-viewport pill geometry with a minimum 44px target.
- [ ] **Step 2: Run the focused tests** and confirm failure on the current desktop/mobile split.
- [ ] **Step 3: Move the phone pill geometry into the shared base rules**, remove the redundant mobile size override, and remove only the horizontal divider while retaining the desktop vertical workspace divider.
- [ ] **Step 4: Run focused component tests and responsive checks** at 375/699/700/1024/1440px.
- [ ] **Step 5: Run `git diff --check`** and report modified files and evidence; do not commit or push.

