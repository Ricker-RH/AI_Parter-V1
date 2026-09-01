### Task 1: Creator workflow contracts and secure database lifecycle

**Files:**
- Create: `packages/contracts/src/creator.ts`
- Create: `packages/contracts/src/creator.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/migrations/202609010022_creator_mode.sql`
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
- [ ] **Step 6: Add migration 022** with creator drafts, immutable revisions, selected reference metadata, operating-authorization acceptance, decision/request tables, indexes, RLS/revokes, actor-derived bounded functions, audit/workflow/business-event/outbox writes, and platform approval that creates `source='creator'` live IPs with `operation_enabled=false`.
- [ ] **Step 7: Add Drizzle parity and repositories** using parameterized SQL, strict schema parsing, keyset cursors, and existing owned/nested session boundaries.
- [ ] **Step 8: Run GREEN** for contracts, DB focused/full tests, typecheck, build, license scan, fresh 001→022 migration, and `git diff --check`.
- [ ] **Step 9: Commit** as `feat: add creator approval lifecycle`.

