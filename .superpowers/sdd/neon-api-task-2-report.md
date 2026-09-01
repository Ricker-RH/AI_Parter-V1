# Task 2 — authenticated current-account API boundary

## Delivered scope

- Added provider-neutral `AuthVerifier`, `AuthResult`, and `VerifiedIdentity` ports.
- Added `ProfilePort` plus a server-side `databaseProfilePort` that delegates only to the two `@aifans/db` root functions.
- Added `GET /v1/me`, composed through optional `createApp({auth, profiles})` dependencies.
- No auth provider implementation was added; a missing auth adapter produces `503 AUTH_NOT_CONFIGURED`.
- The route maps missing, invalid, and blank-subject identities to redacted 401 API errors; provisions the human profile; reads the account as `{subject}`; validates its response with `AccountSchema`; and returns `PROFILE_NOT_AVAILABLE` for no account.

## TDD evidence

1. Added the route-contract tests to `apps/api/src/app.test.ts` before implementing the ports or route.
2. Ran the required focused command:

   ```text
   PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api test -- app.test.ts
   ```

   RED result: 8 new tests failed because `/v1/me` returned `404 NOT_FOUND` instead of the specified route responses.
3. Implemented the minimal ports, adapter, route, and app composition. The same focused command then passed with 11 tests.

## Verification evidence

All commands exited 0:

```text
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api test
# 1 test file, 11 tests passed

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api typecheck

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api build

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm test
# 7 files passed, 3 skipped; 39 tests passed, 13 skipped

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm typecheck

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm build

PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
```

`git diff --check` also exited 0.

## Self-review

- `app.ts` depends only on `ProfilePort`; route tests use test-process collaborators and do not initialize database code.
- `profiles.database.ts` holds no credentials, pool, token, cookie, or provider response; it delegates narrowly to `ensureHumanProfile` and `getCurrentAccount`.
- The only production identity passed into the data layer is the verified subject plus optional profile fields. Current-account lookup receives exactly `{subject}`.
- Error responses use the existing `apiError` / request-ID middleware. Tests cover request-ID matching for every tested error and confirm unexpected collaborator messages are not exposed.
- The task adds no provider SDK, credentials, browser database use, mock/demo data, human-post route, or post-creation boundary.
- No concerns found within Task 2 scope. A real Neon Auth adapter remains intentionally deferred to Task 8.
