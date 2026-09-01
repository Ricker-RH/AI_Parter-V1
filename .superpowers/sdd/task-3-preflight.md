# Task 3 preflight

## Status: ISSUES

1. `tsconfig.base.json` sets `module` and `moduleResolution` to `NodeNext`, while the root package is ESM. Under that mode the exact test import in the brief, `from './index'`, fails `tsc` with TS2835 (relative ESM imports require an explicit extension). Use `from './index.js'`; likewise `src/index.ts` must re-export `./account.js` and `./settings.js`. This is required for the stated `pnpm --dir packages/contracts typecheck` command to exit 0.
2. The current worktree runtime is Node `v22.14.0` and pnpm `11.19.0`, but the committed root contract pins Node `>=24.19.0` and pnpm `11.21.0`. The Task 3 verification commands cannot be said to run against the committed supported environment until those are aligned.

## Verified compatibility

The published Zod `4.5.4` declarations export the top-level factory APIs used by the brief: `z.uuid()`, `z.url()`, and `z.int()` (as well as `z.object`, `z.enum`, and `z.infer`). No Zod API correction is needed. `z.int()` is the current factory API; the legacy form is `z.number().int()`.

## Workspace / package notes

- Task 1 has a valid `pnpm-workspace.yaml` covering `packages/*`, root Vitest 4 project discovery covering `packages/*/vitest.config.ts`, and root `vitest`/TypeScript tooling. No committed package currently occupies `packages/contracts`.
- The brief must include the normal dependency-install/lockfile update after adding `zod@4.5.4`; until that happens `zod` is absent from this lockfile and installed tree. This is an implementation prerequisite, not a schema/API conflict.
