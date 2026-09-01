# Task 2 report: License-safe Bluesky reuse boundary

## Implementation summary

- Added `scripts/check-forbidden-assets.mjs`, which rejects the Bluesky
  carved-out asset paths while allowing `assets/icons/flags/`.
- Added `pnpm license:check` and made `pnpm lint` run it before Turbo.
- Added the Bluesky provenance record, including its repository, reviewed
  commit, MIT source license, excluded asset paths, and a selective-port table.
- Added distribution notices for Bluesky, Inter, Noto Sans, and Lucide
  (including Lucide's Feather-derived icon notice).
- Added the carved-out-icon regression test.

## TDD evidence

### RED

1. Created `tests/forbidden-assets.test.ts` before the checker existed.
2. Ran `pnpm vitest run tests/forbidden-assets.test.ts`.
3. Result: 1 failed test. The spawned Node process reported
   `MODULE_NOT_FOUND` for `scripts/check-forbidden-assets.mjs`, and the test
   failed because its stderr did not yet contain `assets/icons/home.svg`.

### GREEN

1. Implemented the minimal recursive path checker and added the script entry.
2. Ran `pnpm vitest run tests/forbidden-assets.test.ts && pnpm license:check`.
3. Result: the focused test passed (1 file, 1 test) and the repository scan
   exited 0.

## Final verification

Ran after the final notice review:

```text
git diff --check
pnpm test
pnpm license:check
pnpm lint
```

Results:

- `git diff --check`: exit 0.
- `pnpm test`: 2 test files passed, 4 tests passed.
- `pnpm license:check`: exit 0.
- `pnpm lint`: exit 0; the license check ran first, then Turbo reported zero
  package lint tasks in the current foundation workspace.

## Files changed

- `package.json`
- `scripts/check-forbidden-assets.mjs`
- `tests/forbidden-assets.test.ts`

### Review-fix commit

`dcd6fabaf279b2ee7bb50121080ad327b1adf7f6` — `fix: scan nested forbidden assets`
- `docs/third-party/bluesky-ui-provenance.md`
- `THIRD_PARTY_NOTICES.md`

## Self-review

- Verified every required forbidden path pattern is present and that the test
  asserts the reported relative path.
- Verified the provenance document names the required upstream repository,
  reviewed commit, MIT source license, excluded asset directories, and table
  headings.
- Verified notices include Bluesky, Inter, Noto Sans, and Lucide.
- Verified only the five requested task files were committed.

## Concerns

- The current foundation workspace has no package-level Turbo lint tasks, so
  Turbo reports a warning after the boundary check; the command still exits 0.
- The provenance table correctly records that no Bluesky source file has yet
  been ported. Future ports must add a row and any applicable distribution
  notice before merging.

## Commit

`0ee70242ac91c5ab7cb86241a3e91aa033dbec7d` — `chore: enforce UI licensing boundary`

## Review-fix evidence

### Root cause

The initial checker matched only paths beginning with `assets/`. Its anchored
patterns therefore skipped carved-out assets inside a monorepo package, such
as `apps/web/assets/icons/home.svg`.

### RED

Added a parameterized fixture matrix for root and nested paths covering
`illustrations`, non-flag `icons`, `images`, `app-icons`, `splash`, and the
`favicon`, `logo`, and `default-avatar` asset names. Also added an explicit
allowed nested `assets/icons/flags/my.svg` case.

Command:

```text
pnpm vitest run tests/forbidden-assets.test.ts
```

Result: 15 tests ran; 7 nested-path cases failed because the checker exited
with status 0 rather than the expected 1. The 8 root/allowed cases passed.

### GREEN

Changed each forbidden pattern's prefix from `^assets/` to
`(?:^|/)assets/`, preserving the `assets/icons/flags/` exception while
matching an `assets` path segment at any repository depth.

Commands:

```text
pnpm vitest run tests/forbidden-assets.test.ts
pnpm license:check
pnpm test
pnpm lint
git diff --check
```

Results:

- Focused boundary suite: 1 file passed, 15 tests passed.
- `pnpm license:check`: exit 0.
- Full test suite: 2 files passed, 18 tests passed.
- `pnpm lint`: exit 0; the license check ran before Turbo.
- `git diff --check`: exit 0.

### Review-fix files changed

- `scripts/check-forbidden-assets.mjs`
- `tests/forbidden-assets.test.ts`
