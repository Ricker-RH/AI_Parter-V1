# Next Request-Context Token Acquisition Design

## Problem

`fetchAifansApi` starts Vercel OIDC and Neon bearer acquisition through `Promise.resolve().then(...)`. In a Next.js prerender request this moves the Neon token `fetch` outside the framework-managed request context. Vercel runtime logs report `HANGING_PROMISE_REJECTION` for `/neondb/auth/token`, and authenticated server reads fail before reaching the API.

## Design

Keep the existing single `fetchAifansApi` transport, policies, OIDC header, shared deadline, and `AbortController`. Replace microtask scheduling with a small guarded invocation helper that calls each provider immediately in the current request context, converts synchronous throws into rejected promises, and normalizes returned thenables through `Promise.resolve`.

Both acquisition promises are created before awaiting `Promise.all`, so they remain concurrent. `Promise.all` continues to attach rejection handlers to both promises, preventing a later peer rejection from becoming unhandled.

## Scope

- Modify production and test behavior only in `apps/web/src/lib/server-api.ts` and `apps/web/src/lib/server-api.test.tsx`; the required design and implementation-plan documents are process artifacts, not runtime scope.
- Add no dependency, retry, cache, deployment-protection bypass, or alternate transport.
- Preserve fail-closed behavior on Vercel and no OIDC injection outside Vercel.

## Verification

Add a regression test proving both providers are invoked synchronously before `fetchAifansApi` yields to the next microtask. Retain the concurrency, deadline, synchronous-throw, late-rejection, header, and policy tests. Then run the focused suite, full repository tests, typecheck, production build, deploy both Preview projects, and verify the stable Web Preview renders API-backed content without the service-unavailable state.
