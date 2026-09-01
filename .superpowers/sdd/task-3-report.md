# Task 3: Shared domain contracts report

## RED evidence

After creating the package test harness and the specified `account.test.ts`, I ran:

```sh
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/contracts test
```

Vitest failed before test execution with the expected missing-public-contract failure:

```text
Error: Cannot find module './index.js' imported from .../packages/contracts/src/account.test.ts
```

This confirmed the test exercised the absent shared contract API before implementation.

## GREEN evidence

Implemented the specified account, settings, and API error schemas; exported their ESM `.js` barrel paths; and reran the contract tests:

```text
Test Files  1 passed (1)
Tests  2 passed (2)
```

## Final verification

```sh
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm install
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/contracts test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/contracts typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir packages/contracts build
git diff --check
```

All commands passed. The final install used pnpm 11.21.0.

## Files changed

- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/vitest.config.ts`
- `packages/contracts/src/account.test.ts`
- `packages/contracts/src/account.ts`
- `packages/contracts/src/settings.ts`
- `packages/contracts/src/index.ts`
- `pnpm-lock.yaml`

## Self-review

- Confirmed `AccountSchema` accepts only UUID IDs, valid human/IP kinds, constrained lowercase usernames, optional nullable URLs, and the two supported locales.
- Confirmed settings require an explicit approval flag and integer quota in the 0–100 range.
- Confirmed `ApiErrorSchema` exports from the package barrel and all local ESM imports/re-exports use `.js` where required by NodeNext.
- Confirmed package build emits JavaScript and declaration files into ignored `dist/`.
- Confirmed no whitespace errors with `git diff --check`.

## Concerns

None. The package-level tests cover the two specified acceptance cases; additional invalid-input coverage can be added as consumers introduce request/response boundaries.
