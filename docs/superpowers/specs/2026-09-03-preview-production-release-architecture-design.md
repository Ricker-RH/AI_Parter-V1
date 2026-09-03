# Preview and Production Release Architecture Design

**Date:** 2026-09-03
**Status:** Approved for implementation
**Scope:** Make AIFANS preview deployments reliable without weakening Vercel protection, and separate preview data from production data.

## 1. Problem and evidence

AIFANS has two Vercel projects: `ai-parter-v1-web` for Next.js and `aifans-api-dev` for Hono. Both projects produce immutable Preview deployments and Production deployments.

The current preview failure is at the Vercel protection boundary. A signed-in browser can call the protected API Preview and receive `200`, while an unauthenticated terminal call receives a `302` redirect to `vercel.com/sso-api`. The Web Preview makes its upstream request from a Next.js server process, which does not carry the browser's Vercel SSO cookie. The request therefore never reaches the API runtime and the Web renders its unavailable state.

The current database configuration also applies the same Neon connection variables to both Preview and Production. This means the environments are not isolated even though their Vercel deployments are separate.

The deployment audit also found Production SHA drift: Web Production is on `main` commit `d4cb15c`, while API Production was promoted from a feature branch at `e32ff95`. Feature deployments must therefore never be promoted directly to Production; a Production release must originate from one reviewed `main` SHA for both projects.

## 2. Goals

- Keep API Preview protected by Vercel Authentication.
- Allow only the Web Preview server to call the API Preview.
- Separate Preview and Production database state.
- Give each environment one stable Web target and one stable API target.
- Make release order, migration state, verification, and rollback explicit.
- Never expose Vercel OIDC tokens or database credentials to browser code, logs, or artifacts.

## 3. Environment topology

| Environment | Git source | Web target | API target | Neon target |
| --- | --- | --- | --- | --- |
| Preview | feature branch such as `codex/ux-slice-0-1` | Web Preview branch alias | API Preview branch alias | isolated Neon preview branch |
| Production | `main` | Web Production alias | API Production alias | existing Neon `production` branch |

Git branches, Vercel environments, and Neon branches are distinct concepts. Historical immutable Vercel deployment URLs remain useful for audit and rollback but are not presented as competing current environments.

## 4. Service-to-service authentication

The selected approach is Vercel Trusted Sources with short-lived OIDC tokens:

1. API Preview keeps `Require Log In` enabled.
2. The API project's Trusted Sources configuration allows only `ai-parter-v1-web` with `Preview -> Preview` scope.
3. The Web server obtains a token using the official `@vercel/oidc` package.
4. `fetchAifansApi` attaches the token as `x-vercel-trusted-oidc-idp-token` to server-to-server requests.
5. Caller-supplied headers cannot inject or override that header.

OIDC acquisition is best-effort outside Vercel so local development and tests continue to work. On a Vercel Preview, failure to acquire the trusted token must fail clearly at the server boundary rather than silently forwarding browser credentials or disabling protection.

Long-lived protection bypass secrets and public Preview APIs are rejected because they increase secret rotation and exposure risk.

## 5. Database isolation

The existing Neon `production` branch remains the Production database. A separate Preview branch is created from the migrated production schema. Preview-scoped API environment variables point exclusively to Preview credentials; Production-scoped variables remain exclusively on production credentials.

The dedicated Neon Preview branch is named `preview`, has branch ID `br-sparkling-sun-ay5943bs`, is forked from `production`, and has auto-delete disabled so stable Preview aliases cannot unexpectedly lose their data target.

The variables to separate are:

- `DATABASE_USER_URL`
- `DATABASE_PLATFORM_URL`
- `DATABASE_PROVISIONING_URL`
- `DATABASE_RATE_LIMIT_URL`
- `DATABASE_ANALYTICS_URL`
- migration/admin connection variables when used by the release job

No secret value is copied into source control or displayed in task output.

## 6. Web/API routing

`AIFANS_API_URL` remains server-only.

- Web Preview uses the stable API Preview branch alias.
- Web Production uses the API Production alias.
- Browser-visible `NEXT_PUBLIC_AIFANS_API_URL` is not used as a fallback.

All Web server API calls continue through `apps/web/src/lib/server-api.ts`, giving the OIDC header one reviewed injection point and preserving existing request-policy, authentication, timeout, idempotency, and header-sanitization rules.

## 7. Release sequence

Each release uses one exact Git SHA across validation and deployment:

1. Run unit/integration tests, typecheck, and production build.
2. Apply forward-only migrations to the target environment once and verify the migration ledger/checksum.
3. Deploy API for the same SHA.
4. Verify API deployment state, `/health`, and a representative detail endpoint.
5. Deploy Web for the same SHA.
6. Verify Web deployment state and run browser smoke tests against the stable environment alias.
7. Record SHA, Web deployment, API deployment, Neon branch, and migration ledger result in the release evidence.

Migrations are not run concurrently inside multiple Vercel builds.

## 8. Failure handling and rollback

- If Preview database setup fails, Production variables are untouched and release stops.
- If API verification fails, Web is not advanced to the failed API.
- If Web verification fails, the stable Web alias can be rolled back to the previous immutable deployment while the API remains compatible.
- Forward-only database migrations are repaired by a subsequent migration; production data is never reset.
- Trusted Source can be removed independently to revoke Web-to-API Preview access.
- Environment-variable changes are made one environment at a time and verified before proceeding.

## 9. Verification criteria

- Direct anonymous access to API Preview still redirects to Vercel login.
- Web Preview server calls API Preview successfully and receives JSON from the API runtime.
- The content detail route no longer renders unavailable because of the SSO redirect.
- Forged inbound trusted-OIDC headers are removed and replaced only by a server-acquired token.
- Local tests work without Vercel runtime credentials.
- Preview writes are observable only in the Neon Preview branch.
- Production continues using the existing Neon Production branch.
- Stable Preview and Production aliases each identify one current deployable environment.
