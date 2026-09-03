# Next Request-Context Token Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep OIDC and bearer acquisition concurrent without detaching Neon token fetches from the Next.js request context.

**Architecture:** Invoke both token providers immediately through one guarded helper. The helper preserves synchronous request context, converts synchronous throws into rejected promises, and leaves the existing shared deadline and `Promise.all` rejection handling intact.

**Tech Stack:** TypeScript, Next.js 16, Vitest, Vercel OIDC

---

### Task 1: Add the request-context regression test

**Files:**
- Modify: `apps/web/src/lib/server-api.test.tsx`
- Test: `apps/web/src/lib/server-api.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that calls `fetchAifansApi`, records OIDC and bearer provider invocation synchronously, and asserts both calls occurred before awaiting the returned request:

```ts
it('invokes token providers in the current request context before yielding', async () => {
  process.env.AIFANS_API_URL = 'https://api.example'
  process.env.VERCEL = '1'
  process.env.VERCEL_OIDC_TOKEN = unexpiredOidcToken()
  const getToken = vi.fn(async () => 'signed-jwt')
  const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}))

  const request = fetchAifansApi('/v1/me', {policy: 'private-cache', fetcher, getToken})

  expect(getVercelOidcToken).toHaveBeenCalledOnce()
  expect(getToken).toHaveBeenCalledOnce()
  await request
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @aifans/web test -- src/lib/server-api.test.tsx
```

Expected: the new test fails because both providers are currently scheduled in a later microtask.

### Task 2: Preserve request context with guarded immediate invocation

**Files:**
- Modify: `apps/web/src/lib/server-api.ts`
- Test: `apps/web/src/lib/server-api.test.tsx`

- [ ] **Step 1: Add the minimal helper**

Add:

```ts
function invokePromise<T>(provider: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(provider())
  } catch (error) {
    return Promise.reject(error)
  }
}
```

- [ ] **Step 2: Replace detached scheduling**

Replace the two `Promise.resolve().then(...)` calls with:

```ts
const oidcTokenPromise = invokePromise(vercelOidcToken)
const bearerTokenPromise = invokePromise(getToken)
```

- [ ] **Step 3: Run the focused suite and verify GREEN**

Run:

```bash
pnpm --filter @aifans/web test -- src/lib/server-api.test.tsx
```

Expected: all focused tests pass, including immediate invocation, concurrency, sync throw, late rejection, timeout, and header coverage.

### Task 3: Verify and deploy

**Files:**
- Verify: `apps/web/src/lib/server-api.ts`
- Verify: `apps/web/src/lib/server-api.test.tsx`

- [ ] **Step 1: Run repository verification**

```bash
pnpm test
pnpm typecheck
WEB_API_RATE_LIMIT_SIGNING_SECRET=local_validation_secret_32_chars__ pnpm build
git diff --check
```

Expected: zero failures, typecheck succeeds, all five package builds succeed, and no whitespace errors are reported.

- [ ] **Step 2: Commit and push the feature branch**

```bash
git add apps/web/src/lib/server-api.ts apps/web/src/lib/server-api.test.tsx docs/superpowers/specs/2026-09-03-next-request-context-token-acquisition-design.md docs/superpowers/plans/2026-09-03-next-request-context-token-acquisition.md
git commit -m "fix(web): preserve token request context"
git push origin codex/ux-slice-0-1
```

- [ ] **Step 3: Verify Preview deployment**

Confirm API and Web Preview both report Ready for the new commit. Open the stable Web Preview, verify API-backed feed content renders, verify a detail route renders, and confirm new Web logs contain no `/neondb/auth/token` `HANGING_PROMISE_REJECTION` for the verification requests.
