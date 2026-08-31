# AIFANS PostHog Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the approved hybrid analytics design so Web behavior reaches PostHog when configured and authoritative Neon events are delivered by an idempotent transactional-outbox worker.

**Architecture:** Feature code calls typed domain analytics helpers, never the PostHog SDK. A client adapter is a no-op when public configuration is absent. A server-only outbox port claims bounded rows, sends allow-listed payloads with stable event IDs, and updates only delivery metadata after acknowledgement.

**Tech Stack:** TypeScript, Zod, Next.js App Router, Hono, PostgreSQL 17, PostHog capture API, Vitest.

## Global Constraints

- Neon remains authoritative for business state/events; PostHog is behavioral analytics only.
- Analytics failures never block or change a user-facing product action.
- Events use lowercase snake case, `event_version: 1`, closed property schemas, and no raw text/email/token/cookie/prompt/message/search query/object URL.
- Browser identity is AIFANS profile UUID only; logout resets identity; AI/IP IDs are event subjects, never browser identities.
- No broad autocapture; no fake events or seeded analytics.
- Public project ingestion keys may be browser-visible; personal/admin/export/server credentials remain server-only.

---

### Task 1: Typed Web analytics and PostHog browser adapter

**Files:**
- Create: `apps/web/src/lib/analytics/contracts.ts`
- Create: `apps/web/src/lib/analytics/provider.tsx`
- Create: `apps/web/src/lib/analytics/events.ts`
- Create: `apps/web/src/lib/analytics/analytics.test.tsx`
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: real feed/chat/creator components at their existing event boundaries
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`

- [ ] Write RED tests for the exact initial event allow-list, unknown/sensitive property rejection, no-op missing configuration, provider failure isolation, profile UUID identify, logout reset, and absence of message/search/post/comment/prompt bodies.
- [ ] Run focused RED and confirm missing analytics modules.
- [ ] Implement closed event schemas and domain helpers for page/feed/profile/post/chat/creator intent events.
- [ ] Implement a lazy PostHog adapter using exact-pinned `posthog-js`, disabled autocapture, explicit page views, and no-op behavior when `NEXT_PUBLIC_POSTHOG_KEY` is absent.
- [ ] Instrument only existing real interaction boundaries; do not emit completion events from the browser.
- [ ] Run Web full tests, typecheck, production build, license scan, and diff check; commit `feat(web): add typed product analytics`.

### Task 2: PostHog transactional-outbox delivery worker

**Files:**
- Create: `packages/db/migrations/202609010024_analytics_delivery.sql`
- Create: `packages/db/src/analytics-outbox.ts`
- Create: `packages/db/tests/analytics-outbox.test.ts`
- Create: `apps/api/src/ports/analytics.ts`
- Create: `apps/api/src/adapters/posthog-analytics.ts`
- Create: `apps/api/src/routes/internal-analytics.ts`
- Create: `apps/api/src/routes/internal-analytics.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `.env.example`

- [ ] Write RED real-PostgreSQL tests for skip-locked bounded claiming, stable event IDs, success acknowledgement, retry attempt/backoff, permanent failure, stale lease recovery, and concurrent workers without duplicate claims.
- [ ] Write RED adapter/route tests for exact capture payload, timeout, safe transient/permanent classification, worker secret authentication, missing configuration, and no secret/error leakage.
- [ ] Add migration 024 bounded claim/ack/retry functions; authenticated/browser/platform roles receive no execute privilege.
- [ ] Implement DB repository and PostHog capture adapter using server-only key/host; validate every outbox payload with the existing closed history contracts before sending.
- [ ] Implement a bounded internal POST endpoint suitable for Vercel Cron; product requests never call or await it.
- [ ] Run fresh 001→024 migration, DB/API full tests, workspace typecheck/build/license/diff, then commit `feat(api): deliver analytics outbox`.
