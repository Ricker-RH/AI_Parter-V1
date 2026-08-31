# Operator Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bilingual, production-safe internal console for creating AI/IP identities and publishing their text posts and comments.

**Architecture:** A client-only `AdminConsole` owns the three form states and ephemeral created-IP choices. A same-origin Next route forwards only the three approved POST paths to `AIFANS_API_URL`; the localized page supplies copy and never exposes the upstream URL.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl JSON messages, Vitest, Testing Library.

## Global Constraints

- Modify and commit only `apps/web/**`.
- No media inputs, mock data, public operator navigation, or fake success states.
- Forward authentication cookies and request correlation only through the server route.
- Keep English and Simplified Chinese message keys identical.

---

### Task 1: Same-origin admin proxy

**Files:**
- Create: `apps/web/src/app/api/admin/[...path]/route.test.tsx`
- Create: `apps/web/src/app/api/admin/[...path]/route.ts`

**Interfaces:**
- Consumes: `POST(request, {params: Promise<{path: string[]}>})`
- Produces: proxy responses for `ips`, `posts`, and `posts/:uuid/comments` only.

- [ ] Write tests proving cookies, `x-request-id`, JSON bodies, and each approved URL are forwarded; prove unknown paths, query strings, unavailable configuration, and non-POST exports are rejected.
- [ ] Run `pnpm --dir apps/web test -- src/app/api/admin/[...path]/route.test.tsx` and verify failure because the route does not exist.
- [ ] Implement exact path matching, server-only base URL resolution, header forwarding, and safe 503 handling.
- [ ] Re-run the targeted proxy tests and verify they pass.

### Task 2: Operator forms and chaining

**Files:**
- Create: `apps/web/src/components/admin/AdminConsole.test.tsx`
- Create: `apps/web/src/components/admin/AdminConsole.tsx`

**Interfaces:**
- Consumes: localized `AdminLabels` and `Locale`.
- Produces: strict JSON requests and accessible per-form pending, success, and error states.

- [ ] Write tests for strict optional-field omission, created-IP selection, post-to-comment chaining, localized post links, 401/403/503 guidance, and malformed-success rejection.
- [ ] Run `pnpm --dir apps/web test -- src/components/admin/AdminConsole.test.tsx` and verify failure because the component does not exist.
- [ ] Implement the three controlled forms, schema-validated success handling, status-based safe errors, and in-memory chaining.
- [ ] Re-run the targeted component tests and verify they pass.

### Task 3: Localized route and responsive styling

**Files:**
- Create: `apps/web/src/app/[locale]/admin/page.tsx`
- Create: `apps/web/src/app/[locale]/admin/page.test.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh-CN.json`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `pageMessages(params)` and `AdminConsole`.
- Produces: `/{locale}/admin` with operator-only heading and complete bilingual parity.

- [ ] Write locale tests for English and Chinese headings, guidance, fields, actions, and identical admin message keys.
- [ ] Run the route test and verify it fails because the page and copy do not exist.
- [ ] Add the route, exact bilingual keys, and compact monochrome responsive CSS.
- [ ] Run route tests, then `pnpm --dir apps/web test`, `pnpm --dir apps/web typecheck`, and `pnpm --dir apps/web build`.
- [ ] Inspect `git diff --check` and commit only `apps/web/**`.
