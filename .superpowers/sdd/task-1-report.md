# Task 1 Report: Creator workflow contracts and secure database lifecycle

## Status

Implementation and hardened verification complete pending the final independent
review verdict and scoped commit.

The migration number was changed from the original brief's `021` to
`202609010022_creator_mode.sql` by the controller because the parallel Dify/chat
security task owns `202609010021_chat_target_projection.sql`. No historical
migration or chat change was overwritten or renamed.

## Implemented

- Added closed Zod creator contracts for draft identity/persona input,
  submission/reference selection, later requests and decisions, safe creator IP
  and analytics DTOs, immutable revision/submission/request DTOs, and strict
  keyset cursor pages.
- Added actor-scoped and platform-scoped creator repositories. All writes call
  explicit parameterized SQL functions through the existing owned/nested
  `withActor` or `withPlatformActor` transaction boundary. No pool or generic
  JSON writer is exported.
- Added migration 022 with creator quotas, drafts, private reference metadata,
  immutable revisions/reference selections, authorization acceptances,
  submissions/decisions, later requests/decisions, indexes, RLS, raw-table
  revokes, and bounded actor-derived functions.
- Auto approval and operator approval create `source='creator'` live IPs with a
  current immutable identity, `public_state='published'`, and
  `operation_enabled=false`.
- Change, unpublish, and deletion requests remain pending until an idempotent
  operator decision. Deletion preserves historical rows while marking the IP
  unpublished, disabled, and creator-deleted.
- Submission, approval/rejection, quota changes, and later requests/decisions
  write correlated audit, workflow, business-event, and analytics-outbox rows
  in the same transaction.
- Added Drizzle schema parity and package exports.
- Hardened the lifecycle after independent review: quota counts only active new
  IP proposals, rejected/deleted IPs release quota, change drafts target an
  existing owned IP and never consume an IP slot, and only one pending lifecycle
  request may exist per IP.
- Reference object keys are now derived inside the bounded database function
  under an actor/draft/asset private prefix. Candidate private keys are never
  copied into the public `profiles.avatar_object_key` or generic live identity.
- Live creator IPs atomically point to an approved immutable creator revision
  through a same-IP `creator_ip_revisions` association and composite FK. Owner
  get/list projections expose the active themes, visual type, creator
  attribution, and reference IDs/roles without object keys or private persona.
- Keyset cursors use collection-specific kinds and exact timestamp/id bounds;
  pagination no longer depends on the anchor row remaining present.
- Creator request creation and platform decisions share canonical IP-first lock
  ordering. A multi-connection PostgreSQL regression holds the IP lock, verifies
  the decision waits without pre-locking the request, and exercises concurrent
  next-request rejection without a deadlock.

## TDD evidence

### Contracts RED

Command:

`pnpm --dir packages/contracts exec vitest run src/creator.test.ts`

Expected failure captured:

`Cannot find module './creator.js'` (1 failed suite, 0 tests loaded).

### Contracts GREEN

- Focused creator contracts: 6/6 passed.
- Full contracts package: 15/15 passed.
- Contracts typecheck passed.

### Database RED

First RED: `Cannot find module '../src/creator.js'`.

After adding only the bounded repository seam, the same 7 lifecycle tests all
failed for the intended missing database function:

`function public.creator_create_draft(...) does not exist`.

### Database GREEN

- Final focused Creator PostgreSQL suite: 10/10 passed.
- Full DB suite: 77 passed, 5 pre-existing explicit skips, 0 failures.
- Forced analytics-outbox failure test proves draft submission, revision,
  authorization acceptance, live-IP state, audit, workflow, and business event
  all roll back together; all four history/outbox assertions use the failed
  command request ID rather than the draft ID.
- Cross-user isolation, default/per-user quota, approval switch, immutable
  submitted revision, operator-only decisions, idempotency, all three later
  request types, private analytics, RLS, revokes, and function capabilities are
  covered against real PostgreSQL.

## Fresh migration evidence

A disposable `aifans_creator_task1_hardened` PostgreSQL 17 database was dropped,
created, and migrated from an empty database. The runner applied exactly 22
migrations in lexical order:

`202608310001_foundation.sql` through
`202609010021_chat_target_projection.sql`, then
`202609010022_creator_mode.sql`.

Ledger check: `22|202609010022_creator_mode.sql`.

Focused Creator tests then passed 10/10 on that fresh database.

## Full verification evidence

- Root Vitest with real DB URLs: 43 passed files, 1 explicitly skipped file;
  317 passed tests, 5 explicit skips, 0 failures.
- Root typecheck: 5/5 Turbo tasks succeeded.
- Root build: 5/5 Turbo tasks succeeded, including Next production build.
- License/forbidden-asset scan passed.
- `git diff --check` passed.
- Package DB typecheck and build passed.

## Review and concerns

- Self-review corrected an auto-approval workflow transition so history records
  `NULL -> pending_review -> approved`, rejected null/incomplete reference arrays
  at the SQL boundary, and locked the quota target profile before updating a
  per-user override.
- The first independent security review found eight lifecycle/storage/cursor
  issues; all were fixed and its re-review confirmed them resolved. That
  re-review found one additional request/decision lock-order risk, which was
  corrected with IP-first locking and a real multi-connection regression.
- Final post-commit narrow security review verdict is appended below.

## Final review follow-up

The final review requested four additional hardening changes. TDD RED was
captured in the focused Creator suite:

- Drizzle table metadata lacked `ip_profiles_active_creator_revision_fk`.
- Direct role calls with a `NULL` page limit returned only one row instead of a
  bounded full page, and platform queues included terminal history.
- `PlatformCreatorRepository.getRequest` did not exist.

Migration 022 now applies a database-boundary default and hard maximum of 51 to
all six list functions. Platform submission/request lists filter to
`pending_review`/`pending` before keyset comparison and limit. Tests seed 120
mixed terminal/pending histories and verify two queue pages contain only pending
items.

The platform repository now exposes a bounded operator-only request detail
lookup backed by `platform_get_creator_request(uuid)`. It returns the strict
request DTO including its proposed immutable revision, returns `null` when
absent, and rejects non-operators.

Drizzle metadata now mirrors the active creator revision composite FK plus the
creator IP/draft/submission/request cursor and pending indexes. A creator IP
owner cursor index was added to migration 022.

Final follow-up verification:

- Fresh empty PostgreSQL replay: 22 migrations through
  `202609010022_creator_mode.sql`.
- Focused Creator suite: 12/12 passed.
- Full DB suite: 79 passed, 5 explicit skips.
- Root suite: 44 passed files plus 1 explicitly skipped file; 322 passed
  tests, 5 explicit skips.
- Root typecheck and build: 5/5 Turbo tasks succeeded; license scan and
  `git diff --check` passed.
