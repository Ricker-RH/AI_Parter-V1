# AIFANS Creator Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Creator Mode workflow: any authenticated human can create and submit an IP proposal, operators approve it, the creator receives public attribution and read-only analytics, and later changes/unpublishing/deletion require approval.

**Architecture:** Creator-owned drafts and immutable submitted revisions live in Neon behind actor-derived PostgreSQL functions and RLS. Platform decisions use the existing `aifans_platform` session and create the live IP only through bounded audited functions. The Web calls strict AIFANS APIs; private image candidates use an object-storage port that safely returns not-configured until R2 credentials exist.

**Tech Stack:** PostgreSQL 17, Drizzle schema parity, TypeScript, Zod, Hono, Next.js App Router, Vitest, Cloudflare R2-compatible S3 API.

## Global Constraints

- Humans never publish top-level posts or act as an IP.
- Creators have creation and read-only analytics capability, never live-IP management capability.
- Every submitted or approved identity is immutable and historical revisions remain queryable for audit.
- Creator changes, unpublish requests, and deletion requests take effect only after a platform decision.
- Production data starts empty; tests use disposable PostgreSQL fixtures only.
- Browser code never receives Neon, platform, Dify, R2, or PostHog secrets.
- Public UI is bilingual Chinese/English, monochrome, responsive, and shows `Created by @creator` for creator IPs.
- Formal visual types are `realistic`, `anime`, and `hybrid`; the feed also offers mixed/all filtering.

---

### Task 1: Creator workflow contracts and secure database lifecycle

**Files:**
- Create: `packages/contracts/src/creator.ts`
- Create: `packages/contracts/src/creator.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/migrations/202609010021_creator_mode.sql`
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/creator.ts`
- Create: `packages/db/tests/creator-mode.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces strict `CreatorDraftInputSchema`, `CreatorSubmissionSchema`, `CreatorRequestInputSchema`, `CreatorIpSchema`, `CreatorAnalyticsSchema`, and cursor page schemas.
- Produces `createCreatorRepository({withActor})` and `createPlatformCreatorRepository({withPlatformActor})`; neither exports a raw pool or generic JSON writer.

- [ ] **Step 1: Write RED contract tests** for strict unknown-key rejection, bounded names/themes/persona fields, the three visual types, reference count/role uniqueness, authorization acceptance version, and request reason limits.
- [ ] **Step 2: Run RED** with `pnpm --dir packages/contracts exec vitest run src/creator.test.ts`; expect missing-module failures.
- [ ] **Step 3: Implement strict Zod contracts** with closed objects and public DTOs that exclude prompts, object keys, operator IDs, auth subjects, and raw viewer identities.
- [ ] **Step 4: Write RED real-PostgreSQL tests** covering own-draft CRUD, default/per-user quota, immutable submitted revisions, cross-user isolation, submit approval switch, operator approval/rejection, creator change/unpublish/deletion requests, idempotent decisions, and full rollback of audit/history/outbox failure.
- [ ] **Step 5: Run RED** against a disposable migrated PostgreSQL database; expect missing relations/functions.
- [ ] **Step 6: Add migration 021** with creator drafts, immutable revisions, selected reference metadata, operating-authorization acceptance, decision/request tables, indexes, RLS/revokes, actor-derived bounded functions, audit/workflow/business-event/outbox writes, and platform approval that creates `source='creator'` live IPs with `operation_enabled=false`.
- [ ] **Step 7: Add Drizzle parity and repositories** using parameterized SQL, strict schema parsing, keyset cursors, and existing owned/nested session boundaries.
- [ ] **Step 8: Run GREEN** for contracts, DB focused/full tests, typecheck, build, license scan, fresh 001→021 migration, and `git diff --check`.
- [ ] **Step 9: Commit** as `feat: add creator approval lifecycle`.

### Task 2: Creator and operator HTTP APIs plus private asset seam

**Files:**
- Create: `apps/api/src/ports/creator.ts`
- Create: `apps/api/src/ports/assets.ts`
- Create: `apps/api/src/adapters/r2-assets.ts`
- Create: `apps/api/src/routes/creator.ts`
- Create: `apps/api/src/routes/creator.test.ts`
- Create: `apps/api/src/routes/admin-creator.ts`
- Create: `apps/api/src/routes/admin-creator.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Creator routes: draft create/update/delete/list/detail, reference upload-intent/register/select, submit, analytics, and change/unpublish/delete requests.
- Operator routes: pending list/detail, approve/reject submission, approve/reject later requests.
- Asset port returns platform-generated private object keys and short-lived upload/read intents; it never trusts a client-supplied object key.

- [ ] **Step 1: Write RED API tests** for authentication, strict query/path/body parsing including duplicate JSON keys, ownership, quota/conflict/not-found mapping, request ID propagation, safe DTOs, and not-configured storage responses.
- [ ] **Step 2: Run RED** with focused API Vitest files; expect missing routes/ports.
- [ ] **Step 3: Implement creator routes** through the creator port after resolving the authenticated human profile; do not accept actor/operator/profile IDs from bodies.
- [ ] **Step 4: Implement operator routes** through the existing authority check and platform session; every decision carries the request ID.
- [ ] **Step 5: Implement R2-compatible asset adapter** with server-only environment parsing, allowed MIME/size/count metadata, randomized keys, and safe 503 when configuration is absent. Image generation remains an explicit not-configured provider seam and does not fabricate candidates.
- [ ] **Step 6: Run GREEN** for API focused/full tests, typecheck, build, license scan, and `git diff --check`.
- [ ] **Step 7: Commit** as `feat(api): add creator workflow routes`.

### Task 3: Public creator attribution and visual-type discovery

**Files:**
- Create: `packages/db/migrations/202609010022_creator_public_projection.sql`
- Modify: `packages/contracts/src/social.ts`
- Modify: `packages/db/src/social.ts`
- Modify: `apps/api/src/routes/social.ts`
- Modify: `apps/web/src/components/social/FeedContent.tsx`
- Modify: `apps/web/src/components/social/PostCard.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh-CN.json`

**Interfaces:**
- Public `PublicIp` adds `visualType` and optional safe `creator: {id, username, displayName}`.
- Feed accepts `visualType=all|realistic|anime|hybrid`; absent value remains mixed/all.

- [ ] **Step 1: Write RED DB/API/Web tests** for safe creator projection, no private draft leakage, mixed/default feed, type tabs, locale-preserving links, and exact `Created by @username` rendering.
- [ ] **Step 2: Run RED** and confirm failures are caused by missing fields/filtering/UI.
- [ ] **Step 3: Add migration 022 bounded projection** and update repository/API contracts without granting raw creator workflow table access.
- [ ] **Step 4: Add monochrome responsive tabs and attribution** to feed cards/profile surfaces; empty filtered results remain polished and contain no mock content.
- [ ] **Step 5: Run GREEN** for DB/API/Web tests, typechecks, builds, fresh migration, bilingual key parity, and `git diff --check`.
- [ ] **Step 6: Commit** as `feat: expose creator attribution and IP types`.

### Task 4: Creator Center and read-only analytics

**Files:**
- Create: `apps/web/src/app/[locale]/creator/page.tsx`
- Create: `apps/web/src/app/[locale]/creator/[draftId]/page.tsx`
- Create: `apps/web/src/components/creator/CreatorCenter.tsx`
- Create: `apps/web/src/components/creator/CreatorDraftForm.tsx`
- Create: `apps/web/src/components/creator/ReferenceSelector.tsx`
- Create: `apps/web/src/components/creator/CreatorAnalytics.tsx`
- Create: `apps/web/src/app/api/creator/[...path]/route.ts`
- Create: `apps/web/src/app/[locale]/admin/creator/page.tsx`
- Modify: `apps/web/src/components/AppNav.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh-CN.json`

**Interfaces:**
- Same-origin Web proxy exposes an exact method/path allow-list and forwards only cookies and correlation headers.
- Creator Center consumes public creator APIs and never exposes live-IP operation, publishing, chat history, prompts, or model controls.

- [ ] **Step 1: Write RED Web tests** for empty state, creator-mode enablement, draft wizard persistence, all three visual tabs, selected-reference roles, submission authorization acceptance, read-only submitted state, request forms, analytics privacy, admin decisions, bilingual copy, and proxy allow-list.
- [ ] **Step 2: Run RED** and confirm missing-page/component/proxy failures.
- [ ] **Step 3: Implement Creator Center** using real API responses only. Save drafts explicitly; keep generation/upload controls disabled with localized not-configured messages until provider credentials exist.
- [ ] **Step 4: Implement operator review UI** showing current/proposed identity and decision actions without adding IP publishing/operation controls to the creator surface.
- [ ] **Step 5: Run GREEN** for Web full tests, typecheck, production build, locale parity, accessibility assertions, and `git diff --check`.
- [ ] **Step 6: Browser smoke-test** Chinese/English, desktop/mobile, light/dark, empty state, draft flow, and not-configured asset state against local production builds.
- [ ] **Step 7: Commit** as `feat(web): add creator center`.

### Final release verification

- [ ] Apply migrations 017–022 to hosted Neon only after fresh local migration and database review pass.
- [ ] Verify hosted migration ledger and confirm product tables remain empty unless real operator/user actions created rows.
- [ ] Run root tests, typecheck, build, license scan, and `git diff --check`.
- [ ] Verify no browser bundle or repository file contains provider/database secrets.
- [ ] Push `codex/aifans-foundation` to GitHub and document the remaining Vercel/Dify/R2/PostHog/Auth environment variables without values.
