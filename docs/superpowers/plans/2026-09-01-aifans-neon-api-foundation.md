# AIFANS Neon API Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimal typed Hono API boundary for AIFANS health checks and authenticated current-account access using the completed Neon profile repository.

**Architecture:** Hono routes depend on small authentication and profile ports rather than Neon Auth or database SDKs directly. A verified external subject is provisioned idempotently through the privileged profile path, then read back through the RLS-scoped current-account path. Neon Auth integration remains a replaceable adapter implemented with the Web authentication slice.

**Tech Stack:** Node.js 24.19.0, pnpm 11.21.0, TypeScript 7.0.2, Hono 4.13.5, Zod 4.5.4, Vitest 4.1.11, `@aifans/contracts`, `@aifans/db`.

## Global Constraints

- Humans cannot publish top-level posts or change their account kind to `ip`.
- Browser code never receives database URLs, privileged credentials, or raw provider errors.
- Routes never import Neon, Drizzle, PostgreSQL, or Neon Auth SDKs directly.
- Missing and invalid authentication are distinct typed `401` errors.
- Every response carries an `x-request-id`; every error body carries the same request ID.
- Test doubles are allowed only as isolated test collaborators and never become product/demo data.
- No route for human top-level post creation exists in this foundation.
- Every dependency is pinned exactly and behavior follows RED → GREEN TDD.

---

## File map

```text
apps/api/package.json                    API package and exact dependencies
apps/api/tsconfig.json                   NodeNext TypeScript build
apps/api/vitest.config.ts                Root-project-compatible test config
apps/api/src/ports/auth.ts               Provider-neutral verified identity contract
apps/api/src/ports/profiles.ts           Narrow profile repository contract
apps/api/src/ports/profiles.database.ts  Server-only Neon repository composition
apps/api/src/middleware/request-id.ts    Request correlation
apps/api/src/errors.ts                   Typed safe API error creation
apps/api/src/routes/health.ts            Public health route
apps/api/src/routes/me.ts                Authenticated profile route
apps/api/src/app.ts                      Dependency-composed Hono app
apps/api/src/index.ts                    Server exports
apps/api/src/app.test.ts                 Route behavior tests
```

### Task 1: Typed Hono shell and request correlation

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/middleware/request-id.ts`
- Create: `apps/api/src/errors.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/app.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: workspace TypeScript/Vitest configuration and `ApiErrorSchema`.
- Produces: `createApp(dependencies)`, `GET /health`, `requestIdMiddleware`, and `apiError(c, status, code, message)`.

- [ ] **Step 1: Write failing health/request-ID tests**

```ts
// apps/api/src/app.test.ts
import {describe, expect, it} from 'vitest'
import {ApiErrorSchema} from '@aifans/contracts'
import {createApp} from './app.js'

describe('AIFANS API shell', () => {
  it('returns public health with a correlated request ID', async () => {
    const response = await createApp().request('/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(await response.json()).toEqual({status: 'ok', service: 'aifans-api'})
  })

  it('returns a typed not-found error with the same request ID', async () => {
    const response = await createApp().request('/does-not-exist')
    const requestId = response.headers.get('x-request-id')
    const body = ApiErrorSchema.parse(await response.json())
    expect(response.status).toBe(404)
    expect(body).toMatchObject({code: 'NOT_FOUND', requestId})
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api test -- app.test.ts
```

Expected: FAIL because the API package and `createApp` do not exist.

- [ ] **Step 3: Add the exact package configuration**

```json
// apps/api/package.json
{
  "name": "@aifans/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {".": "./dist/index.js"},
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aifans/contracts": "workspace:*",
    "@aifans/db": "workspace:*",
    "hono": "4.13.5",
    "zod": "4.5.4"
  },
  "devDependencies": {
    "@types/node": "24.13.3",
    "typescript": "7.0.2",
    "vitest": "4.1.11"
  }
}
```

`tsconfig.json` extends the root config, uses `NodeNext`, writes declarations and JS to `dist`, and includes `src/**/*.ts`. `vitest.config.ts` names the project `api` and includes `src/**/*.test.ts`.

- [ ] **Step 4: Implement the shell and safe errors**

`requestIdMiddleware` always generates `crypto.randomUUID()`, stores it in typed Hono variables, calls the next handler, and then sets `x-request-id` on the response.

`apiError` constructs `{code, message, requestId}` and validates it with `ApiErrorSchema` before returning JSON. `createApp()` installs correlation first, registers `GET /health`, returns `NOT_FOUND` for unmatched routes, and catches unexpected errors as `INTERNAL_ERROR` without including stack/error text. Export the app factory and public API types from `src/index.ts` with NodeNext `.js` specifiers.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm install
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api test -- app.test.ts
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/api typecheck
```

Expected: tests pass, typecheck exits 0, exact pins appear in the lockfile.

- [ ] **Step 6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat: add typed API shell"
```

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
