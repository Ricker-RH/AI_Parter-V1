# Social Chat Test Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved human social/private-chat experience in the isolated test environment with baseline authorization, Cloudflare-replaceable realtime boundaries, media, and responsive UI.

**Architecture:** Preserve the existing HUMAN→IP AI chat and add compatible human social/DM models. PostgreSQL is authoritative; API commands enforce permissions; Cloudflare only transports versioned realtime events; R2 private assets use authorized access. Existing inbox, profile and avatar primitives are extended rather than replaced.

**Tech Stack:** TypeScript, PostgreSQL/Neon, Hono API, Next.js 16/React 19, Cloudflare Workers/Durable Objects, R2, Vitest/Playwright.

---

### Task 1: Versioned contracts and additive relational model

**Files:** create `packages/db/migrations/202609040005_human_social_chat.sql`; modify `packages/db/src/schema.ts`, `packages/contracts/src/account.ts`, `packages/contracts/src/social.ts`, `packages/contracts/src/chat.ts`; add focused contract/schema tests.

- [ ] Write failing tests for profile visibility, HUMAN/IP participant discrimination, typed message content, receipt/presence events, block/follow results, bounded IDs/payloads and unknown-field rejection.
- [ ] Add privacy/presence preferences, canonical human pair, participant membership, typed messages, per-member read cursors, block records, durable first-contact consumption and transactional outbox. Preserve existing AI tables and data.
- [ ] Restrict direct writes, enable FORCE RLS, create participant policies and bounded security-definer commands with fixed `search_path`, actor identity and canonical locking.
- [ ] Run `pnpm --dir packages/contracts test`, schema tests and migrated PostgreSQL integration tests; expect all pass. Commit only Task 1 files.

### Task 2: Server-authoritative human profiles, follows, privacy and blocks

**Files:** modify `packages/db/src/profiles.ts`, `packages/db/src/social.ts`, relevant DB ports, `apps/api/src/routes/social.ts`; add route/repository/DB authorization tests.

- [ ] Write failing tests for public human profile basic projection, owner/non-owner four-tab visibility, locked response without cursor/count leakage, follow-back notification deduplication and block/unblock behavior.
- [ ] Implement actor-resolved endpoints and repository commands. Keep IP public profile/two-tab behavior unchanged. Block atomically removes both follows; unblock restores nothing.
- [ ] Cover forged IDs, direct private-tab access, concurrent follow/block, blocked notifications and restricted-role bypass in PostgreSQL tests.
- [ ] Run targeted API/DB tests and typecheck; expect all pass. Commit only Task 2 files.

### Task 3: Human DM commands, ordering, receipts and private media

**Files:** extend API/repository ports and routes under `apps/api/src`; create focused human-DM repository modules under `packages/db/src`; add an R2 private-chat-media adapter without changing public profile-asset semantics.

- [ ] Write failing tests for one first-contact message per canonical pair, mutual-follow continuation, block/send races, idempotent retry, participant-only history, monotonic read cursor, reconnect cursor, attachment ownership/type/size and authorized retrieval.
- [ ] Implement message/outbox insertion as one transaction with canonical pair locking. Acknowledge only persisted messages; never reset allowance on delete/unfollow/block cycles.
- [ ] Implement private upload intents/finalization and short-lived authorized retrieval. Validate content metadata before send; never return permanent public URLs.
- [ ] Run targeted API/DB/R2 tests; expect all pass. Commit only Task 3 files.

### Task 4: Replaceable realtime service and Dify bridge

**Files:** add a focused Cloudflare Worker package with `wrangler.jsonc`; add shared realtime event contracts and web/API transport adapters; modify deployment docs/config only for test resources.

- [ ] Write failing tests for single-use short-lived tickets, origin/audience/expiry/replay validation, participant subscription authorization, event deduplication, reconnect catch-up, permission revocation, queue/payload bounds and AI state transitions.
- [ ] Implement the client transport interface and Cloudflare adapter using Durable Object WebSocket hibernation. Durable Objects coordinate sockets/presence only; API/DB authorize durable business commands.
- [ ] Keep Dify server-side HTTP/SSE; persist generating/partial/failed/completed states and prevent duplicate billable generation on retry. Missing config disables AI send honestly.
- [ ] Run worker/API contract and integration tests; expect all pass. Do not buy/upgrade resources. Commit only Task 4 files.

### Task 5: Responsive human profile, inbox and complete composer

**Files:** extend existing components in `apps/web/src/components/profile`, `social`, and `chat`, plus localized strings and web API adapters. Read relevant Next.js 16 docs before editing per `apps/web/AGENTS.md`.

- [ ] Write failing UI tests for shared avatar preview, HUMAN four-tab/IP two-tab pages, locked tab explanation, follow/follow-back/chat/block states, unread badges, saved/read receipts, typing expiry, visible/hidden presence and responsive master/detail navigation.
- [ ] Reuse `InboxWorkspaceFrame`, `ConversationList`, `ConversationDetail`, `ChatComposer`, Avatar and page headers. Do not create a second visual system.
- [ ] Add accessible emoji, private image/camera, voice recording/playback, bounded sticker set and internal share-card flows with permission-denied/unsupported/upload-failure states.
- [ ] Run targeted web tests, accessibility assertions and typecheck; expect all pass. Commit only Task 5 files.

### Task 6: Integrated security, deployment and two-account acceptance

**Files:** add focused Playwright journeys and update `docs/operations`; deployment configuration limited to test environment.

- [ ] Run migrations against the isolated test database, deploy API/Web/Worker test revisions, and record exact SHAs/URLs/resources. Keep production untouched.
- [ ] Run two isolated authenticated browser contexts through first-contact/mutual gate, follow-back notification, privacy, block/unblock, realtime send/read, reconnect/catch-up and media authorization on mobile and desktop.
- [ ] Run adversarial API/WebSocket tests: cross-account history/media/subscription, forged sender, replayed/expired ticket, duplicate concurrent send, blocked active connection and direct private-tab access.
- [ ] Run full `pnpm test`, `pnpm typecheck`, `pnpm lint`, build and production-mode E2E as applicable; expect zero failures. Review deployed logs and verify deployed SHA before reporting ready.
- [ ] Document rollback for migrations, Worker routing and deployments. Ask before any paid upgrade; report code/test/deployment/browser-validation states separately.

## Self-review

All approved requirements map to a task. Existing AI chat remains compatible; Cloudflare is behind adapters; baseline security is implemented before test acceptance. Commercial moderation/legal/load testing remains explicitly out of this test release, while authentication, authorization, secrets, rate limits and environment isolation remain in scope.
