### Task 2: Authenticated current-account route

**Files:**
- Create: `apps/api/src/ports/auth.ts`
- Create: `apps/api/src/ports/profiles.ts`
- Create: `apps/api/src/ports/profiles.database.ts`
- Create: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: `AccountSchema`, `Actor`, `EnsureHumanProfileInput`, `ensureHumanProfile`, and `getCurrentAccount`.
- Produces: `AuthVerifier`, `AuthResult`, `VerifiedIdentity`, `ProfilePort`, and `GET /v1/me`.

- [ ] **Step 1: Add failing route-contract tests**

Create test-local collaborators implementing the exact ports; their records live only in the test process.

```ts
const missingAuth = {verify: async () => ({status: 'missing'} as const)}
const invalidAuth = {verify: async () => ({status: 'invalid'} as const)}
const identity = {
  subject: 'neon_auth_subject',
  email: 'luna@example.com',
  displayName: 'Luna',
}
const validAuth = {verify: async () => ({status: 'authenticated', identity} as const)}
```

Tests must assert:

- no credential produces `401 AUTH_REQUIRED`;
- invalid credential produces `401 AUTH_INVALID`;
- authenticated access calls provisioning once with the verified identity;
- authenticated access calls current-account lookup with only `{subject}`;
- success returns an `AccountSchema` object and status 200;
- null current account returns `500 PROFILE_NOT_AVAILABLE`;
- an unexpected collaborator error returns redacted `500 INTERNAL_ERROR` and does not expose its message;
- every error body/request header shares the same request ID.

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api test -- app.test.ts
```

Expected: FAIL because the ports and `/v1/me` route do not exist.

- [ ] **Step 3: Define the provider-neutral ports**

```ts
// apps/api/src/ports/auth.ts
export type VerifiedIdentity = {
  subject: string
  email?: string | null
  displayName?: string | null
}

export type AuthResult =
  | {status: 'missing'}
  | {status: 'invalid'}
  | {status: 'authenticated'; identity: VerifiedIdentity}

export type AuthVerifier = {
  verify(request: Request): Promise<AuthResult>
}
```

```ts
// apps/api/src/ports/profiles.ts
import type {Account} from '@aifans/contracts'
import type {Actor, EnsureHumanProfileInput} from '@aifans/db'

export type ProfilePort = {
  ensureHumanProfile(input: EnsureHumanProfileInput): Promise<unknown>
  getCurrentAccount(actor: Actor | null): Promise<Account | null>
}
```

Do not expose tokens, cookies, provider responses, database pools, or connection strings through either port.

- [ ] **Step 4: Implement `/v1/me` and production profile composition**

`createApp` accepts optional `{auth, profiles}` dependencies. `/v1/me` requires both; if no auth adapter is configured it returns `503 AUTH_NOT_CONFIGURED`. The route passes `c.req.raw` to `AuthVerifier.verify`. It maps `missing` and `invalid` exactly, rejects authenticated identities whose subject is blank/whitespace as `AUTH_INVALID`, calls `ensureHumanProfile(identity)`, then `getCurrentAccount({subject})`, and validates a non-null result with `AccountSchema` before returning it.

In `profiles.database.ts`, export `databaseProfilePort`, a narrow object delegating only to the two `@aifans/db` root functions. It is server-only and contains no credentials itself. Re-export it from the package root, but keep `app.ts` dependent only on `ProfilePort` so route unit tests do not initialize database code. Do not provide a placeholder production `AuthVerifier`; Task 8 must supply the real Neon Auth adapter explicitly.

- [ ] **Step 5: Verify the API package and root workspace**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
```

Expected: API and root tests pass, typecheck/build/license scan exit 0, and no hosted credentials are required.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: add authenticated API boundary"
```

## Completion gate

Before Web shell/auth work begins, run root test/typecheck/build/license checks and obtain an independent review of the full API task range. The reviewer must confirm that no route or error exposes credentials/provider errors and that no human-post creation boundary exists.
