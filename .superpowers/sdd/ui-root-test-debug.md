# Root UI test debug (Phase 1–3, read-only)

Date: 2026-09-01

## Scope and runtime

This investigation made no source, configuration, or commit changes. The repository
declares Node `24.19.0` in `.nvmrc`, `>=24.19.0` in `package.json`, and pnpm
`11.21.0` in `package.json`. Those exact runtime versions are not installed in the
available read-only environment. Reproduction used the installed Node `v24.8.0`,
pnpm `11.19.0`, and the locked Vitest `4.1.11`.

The failures are deterministic and arise from repository configuration/test path
assumptions, not from a Node API introduced between these patch releases. Re-run the
commands below with the declared versions before merging a fix.

## Phase 1 — reproduction and trace evidence

From the repository root, `pnpm test` exits 1:

```text
FAIL |@aifans/ui| src/styles/tokens.test.tsx
Error: ENOENT: no such file or directory, open
'<repo>/src/styles/tokens.css'
 ❯ src/styles/tokens.test.tsx:6:16

FAIL |@aifans/ui| src/components/Logo.test.tsx
ReferenceError: document is not defined
 ❯ @testing-library/react/dist/pure.js:256:5
 ❯ src/components/Logo.test.tsx:7:5
```

`pnpm --dir packages/ui test` exits 0: 2 files and 3 tests pass. Its script is
`vitest run --environment jsdom`, and it changes the process working directory to
`packages/ui`.

Independent environment probe from `packages/ui`:

| Command | Result |
| --- | --- |
| `pnpm exec vitest run src/components/Logo.test.tsx` | fails with `document is not defined` |
| `pnpm exec vitest run --environment jsdom src/components/Logo.test.tsx` | passes (1 test) |

Root configuration loads `packages/ui/vitest.config.ts` as a Vitest project, but the
project specifies only `include` and `setupFiles`; it does not specify an environment.
The `--environment jsdom` in `packages/ui/package.json` belongs only to the package
script invocation and is not part of that shared project configuration.

## Phase 2 — relevant change history and pattern comparison

* `69c7077 feat: add AIFANS design foundation` introduced the UI config and Logo
  test. It placed the jsdom selection in `packages/ui/package.json` rather than the
  project config.
* `1f8a2ba fix: publish complete UI design tokens` introduced
  `packages/ui/src/styles/tokens.test.tsx`. It assigns `process.cwd()` to
  `packageRoot` and reads `src/styles/tokens.css` and `package.json` relative to it.
* In a package-local invocation, the working directory happens to be
  `packages/ui`; in the root Vitest project invocation, it remains the repository
  root. Hence the root lookup incorrectly becomes `<repo>/src/styles/tokens.css`.

The contracts and database Vitest projects each declare their own test settings in
their config files. The UI project is the only project that requires browser globals,
but it has not declared that requirement at the project boundary.

## Phase 3 — root-cause hypotheses and minimal TDD fixes

### 1. `tokens.css` root-relative lookup

**Hypothesis:** `process.cwd()` is not a stable representation of the UI package
directory under Vitest projects. It is the repository root for `pnpm test`, so the
module-level `readFileSync` in `packages/ui/src/styles/tokens.test.tsx` constructs a
nonexistent root-level stylesheet path and aborts the suite before test collection.

**Evidence:** The exact failing path is `<repo>/src/styles/tokens.css`; package-local
test execution passes; the tested file exists instead at
`<repo>/packages/ui/src/styles/tokens.css`; blame identifies the assumption in
commit `1f8a2ba`.

**Smallest TDD fix scope:** Update only
`packages/ui/src/styles/tokens.test.tsx`. Retain the existing root-run failure as the
regression case, then derive the package root from the test module URL (for example,
`fileURLToPath(new URL('../../package.json', import.meta.url))` for the manifest and
the corresponding `./tokens.css` URL), rather than from `process.cwd()`. Verify
both `pnpm test` and `pnpm --dir packages/ui test`.

### 2. `document is not defined` in the Logo test

**Hypothesis:** The UI Vitest *project* defaults to Vitest's Node environment when
run from root. `@testing-library/react` needs DOM globals, but the root project config
does not declare jsdom. The package-local script masks the omission by passing a
one-off CLI flag.

**Evidence:** The root stack enters Testing Library `render` and fails on
`document`; package-local Vitest without `--environment` reproduces the same failure;
the same direct UI command with `--environment jsdom` passes; and
`packages/ui/vitest.config.ts` has no `test.environment` entry.

**Smallest TDD fix scope:** Update only `packages/ui/vitest.config.ts` to set
`test.environment` to `jsdom`. The existing `Logo.test.tsx` is already the minimal
failing regression test. Keep the package script unchanged for the smallest patch,
or remove its now-redundant `--environment jsdom` only as a separate consistency
cleanup. Verify the root command specifically, because root project execution is the
failure surface.

## Required post-fix verification (declared runtime)

```sh
node --version # v24.19.0
pnpm --version # 11.21.0
pnpm test
pnpm --dir packages/ui test
```
