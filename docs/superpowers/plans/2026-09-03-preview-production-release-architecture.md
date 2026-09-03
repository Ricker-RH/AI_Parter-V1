# Preview and Production Release Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make protected Preview Web-to-API calls reliable with Vercel OIDC and isolate Preview data from Production while preserving a repeatable, verified release path.

**Architecture:** Keep Web and API as separate Vercel projects. Add one server-only OIDC injection point in `fetchAifansApi`, scope Trusted Sources to Preview-to-Preview, and map Vercel Preview/Production variables to separate Neon branches. Release API before Web and verify each boundary using an exact Git SHA.

**Tech Stack:** Next.js 16, TypeScript, Vitest, `@vercel/oidc`, Vercel CLI/dashboard, Neon PostgreSQL, pnpm/turbo.

**Cloud identifiers:** Web `prj_ESJm2hsTlat3qYS375DqokVGMhIW`; API `prj_a8Gr1yHAkXeOvz5g3ZB4kDZ8IP4d`; team `team_IB6sdKfgB6NOrJ90AhLQEW4q`; Neon project `autumn-math-86042328`; Neon Preview branch `br-sparkling-sun-ay5943bs`.

---

### Task 1: Preserve the responsive UI fixes

**Files:**
- Modify: `apps/web/src/app/globals.test.ts`
- Verify: `apps/web/src/components/social/SocialContent.test.tsx`
- Verify: `apps/web/src/components/chat/ConversationList.test.tsx`
- Verify: `apps/web/src/components/chat/NotificationsWorkspace.test.tsx`
- Verify: `tests/e2e/mobile-scroll-clearance.spec.ts`

- [ ] **Step 1: Update the two legacy CSS assertions**

Replace assertions for the literal mobile-nav height and `.comments-section { padding-bottom: 132px }` with assertions for `--mobile-bottom-nav-height`, `--post-detail-composer-clearance`, and the scroll-surface spacer contract.

- [ ] **Step 2: Run focused tests**

Run the Web CSS, social, and chat tests. Expected: all selected tests pass.

- [ ] **Step 3: Run responsive browser tests**

Run `tests/e2e/mobile-scroll-clearance.spec.ts` in Chromium and mobile WebKit. Expected: list/detail geometry passes at 375, 699, 700, and 1024 pixels with no horizontal overflow.

### Task 2: Add server-only Vercel OIDC transport

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/lib/server-api.ts`
- Modify: `apps/web/src/lib/server-api.test.tsx`

- [ ] **Step 1: Write failing transport tests**

Add tests proving that a server-acquired token is sent as `x-vercel-trusted-oidc-idp-token`, forged inbound values are discarded, local/no-token execution sends no trusted header, and token acquisition shares the existing bounded request deadline.

- [ ] **Step 2: Verify RED**

Run the `server-api` test file. Expected: new OIDC assertions fail because the transport does not yet acquire or send the token.

- [ ] **Step 3: Add the official dependency**

Add `@vercel/oidc` to the Web workspace with pnpm so the lockfile is updated mechanically.

- [ ] **Step 4: Implement one OIDC injection point**

Create an internal token provider that dynamically imports `@vercel/oidc`, obtains a short-lived token in Vercel server runtime, and returns `null` outside that runtime. Extend outbound header construction so only this provider can set `x-vercel-trusted-oidc-idp-token`; never copy that header from `RequestInit` or client headers.

- [ ] **Step 5: Verify GREEN**

Run `server-api` tests, all Web library/route tests that use `fetchAifansApi`, and Web typecheck. Expected: all pass without requiring a live Vercel token.

### Task 3: Create and map the Preview database environment

**Cloud configuration:**
- Neon project `AI PARTER`
- Vercel API project `aifans-api-dev`

- [ ] **Step 1: Snapshot metadata without secret values**

Record current Neon branch IDs, Vercel variable names/scopes, Production/Preview aliases, and current deployment SHAs. Do not print environment-variable values.

- [x] **Step 2: Create an isolated Neon Preview branch**

The `preview` branch was created from `production` with auto-delete disabled. Verify its schema migration ledger and required threaded-comment objects before routing API traffic to it.

- [ ] **Step 3: Scope Preview API variables**

Set the five runtime database URL variables and any release-only migration variable for Vercel Preview only. Keep Production values scoped only to Production.

- [ ] **Step 4: Verify isolation**

Deploy or invoke API Preview against the Preview branch, verify `/health` and a read endpoint, and confirm the Preview database identity without exposing credentials.

### Task 4: Authorize Preview Web to Preview API

**Cloud configuration:**
- Trusted source: `ai-parter-v1-web`
- Protected target: `aifans-api-dev`
- Permission: `Preview -> Preview`

- [ ] **Step 1: Show the exact permission change for confirmation**

Before the final cloud mutation, state that only Web Preview deployments will be allowed through API Preview protection. Production-to-Preview, Preview-to-Production, and browser bypass access remain denied.

- [ ] **Step 2: Add the Trusted Source**

Add `ai-parter-v1-web` as the sole trusted project source with Preview-to-Preview scope.

- [ ] **Step 3: Verify protection and trust paths**

Confirm an anonymous direct request still receives the Vercel protection redirect, while a deployed Web Preview server request reaches API runtime and receives the expected JSON response.

### Task 5: Normalize environment routing and deploy exact SHA

**Cloud configuration:**
- Web project `ai-parter-v1-web`
- API project `aifans-api-dev`

- [ ] **Step 1: Scope Web API targets**

Set Preview `AIFANS_API_URL` to the stable API Preview branch alias and Production `AIFANS_API_URL` to the API Production alias. Do not add a browser-public fallback.

- [ ] **Step 2: Run the full release gate**

Run repository tests, database tests, typecheck, build, responsive E2E, and `git diff --check`. Expected: zero failures; explicitly classify intentional skips.

- [ ] **Step 3: Deploy API first**

Deploy the reviewed exact SHA to API Preview. Verify Ready state, SHA, `/health`, detail endpoint, and Preview database target.

- [ ] **Step 4: Deploy Web second**

Deploy the same reviewed SHA to Web Preview. Verify Ready state, branch alias, server-to-server API response, detail page, messages tabs, and mobile scroll clearance.

- [ ] **Step 5: Record release evidence**

Report the one stable Preview Web URL, exact Git SHA, API deployment, database branch, migration ledger result, and smoke-test results. Keep immutable deployment URLs as audit details only.
