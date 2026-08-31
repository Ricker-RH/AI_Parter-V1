# AIFANS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable, real-data AIFANS foundation with a license-safe reusable UI boundary, bilingual responsive shell, Supabase authentication, minimal API, empty states, and automated verification.

**Architecture:** Use a pnpm/Turborepo monorepo with a Next.js Web app, Hono API, shared contracts and UI packages, and Supabase for authentication and PostgreSQL. Reuse MIT-licensed Bluesky source patterns selectively and record provenance, while excluding every asset carved out by upstream `ASSETS.md`.

**Tech Stack:** Node.js 24.19.0, pnpm 11.21.0, TypeScript 7.0.2, Next.js 16.3.3, React 19.2.8, Hono 4.13.5, Supabase CLI 2.116.0, Supabase JS 2.112.4, Tailwind CSS 4.3.3, next-intl 4.14.1, next-themes 0.4.6, Lucide React 1.38.0, Zod 4.5.4, Vitest 4.1.11, Playwright 1.62.1.

## Global Constraints

- Humans cannot publish top-level posts through UI or API.
- Development, staging, and production contain no seeded mock users, IPs, posts, comments, counters, or chat data.
- Chinese and English, desktop and mobile Web, and light and dark themes are required from the first vertical slice.
- Bluesky source code may be reused under MIT; excluded upstream artwork, icon glyphs, product imagery, and trademarks must not enter the repository.
- AIFANS uses its own brand assets and Lucide icons.
- Provider access occurs behind typed interfaces; page components do not call Supabase tables directly.
- Every behavior change follows test-driven development and ends in a focused commit.

---

## File map

```text
apps/
  api/                  Hono HTTP API and Supabase-authenticated application boundary
  web/                  Next.js AIFANS user application
packages/
  contracts/            Zod schemas and shared request/response types
  ui/                   AIFANS design tokens and reusable Web components
supabase/
  migrations/           Versioned PostgreSQL schema and RLS
  tests/                pgTAP database authorization tests
scripts/
  check-forbidden-assets.mjs  Prevents non-licensed Bluesky assets entering AIFANS
docs/third-party/       Provenance and license decisions
tests/e2e/              Playwright browser journeys
```

### Task 1: Reproducible monorepo and verification baseline

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `tests/workspace.test.ts`

**Interfaces:**
- Consumes: the repository root and approved design specification.
- Produces: root commands `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and workspace globs `apps/*` and `packages/*`.

- [ ] **Step 1: Write the failing workspace contract test**

```ts
// tests/workspace.test.ts
import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

describe('workspace contract', () => {
  it('pins the approved runtime and package manager', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(root.packageManager).toBe('pnpm@11.21.0')
    expect(root.engines.node).toBe('>=24.19.0')
  })

  it('defines every verification command', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(Object.keys(root.scripts)).toEqual(
      expect.arrayContaining(['build', 'lint', 'typecheck', 'test']),
    )
  })
})
```

- [ ] **Step 2: Run the test and verify the missing workspace fails**

Run: `pnpm dlx vitest@4.1.11 run tests/workspace.test.ts`  
Expected: FAIL because `package.json` does not exist.

- [ ] **Step 3: Add the root workspace configuration**

```json
// package.json
{
  "name": "aifans",
  "private": true,
  "packageManager": "pnpm@11.21.0",
  "engines": {"node": ">=24.19.0"},
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "vitest run --workspace vitest.workspace.ts",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@types/node": "^24.0.0",
    "prettier": "3.9.6",
    "turbo": "2.10.12",
    "typescript": "7.0.2",
    "vitest": "4.1.11"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {"dependsOn": ["^build"], "outputs": [".next/**", "dist/**"]},
    "dev": {"cache": false, "persistent": true},
    "lint": {"dependsOn": ["^lint"]},
    "typecheck": {"dependsOn": ["^typecheck"]},
    "test": {"dependsOn": ["^build"], "outputs": ["coverage/**"]}
  }
}
```

Set `.nvmrc` to `24.19.0`, `.npmrc` to `engine-strict=true`, and `tsconfig.base.json` to strict TypeScript settings with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled. Set `.env.example` to contain names only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `API_ORIGIN`, and `WEB_ORIGIN`. Ignore `.env*` except `.env.example`, build output, coverage, Playwright output, and local Supabase state.

```ts
// vitest.workspace.ts
import {defineWorkspace} from 'vitest/config'

export default defineWorkspace([
  'tests/**/*.test.ts',
  'apps/*/vitest.config.ts',
  'packages/*/vitest.config.ts',
])
```

- [ ] **Step 4: Install and verify the baseline**

Run: `corepack enable && corepack prepare pnpm@11.21.0 --activate && pnpm install`  
Expected: lockfile created and install exits 0.

Run: `pnpm test`  
Expected: the two workspace contract tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .nvmrc .npmrc .gitignore .env.example package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json vitest.workspace.ts tests/workspace.test.ts
git commit -m "build: establish AIFANS monorepo"
```

### Task 2: License-safe Bluesky reuse boundary

**Files:**
- Create: `docs/third-party/bluesky-ui-provenance.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `scripts/check-forbidden-assets.mjs`
- Create: `tests/forbidden-assets.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Bluesky `social-app` commit `89c8e1cb70536ab4a05aae0d5b4654362a87ba6e` and its `LICENSE`, `ASSETS.md`, and `NOTICE.md`.
- Produces: command `pnpm license:check` and a provenance record for every selectively ported file.

- [ ] **Step 1: Write a failing forbidden-asset test**

```ts
// tests/forbidden-assets.test.ts
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {afterEach, expect, it} from 'vitest'

const fixture = 'tests/.tmp-forbidden-assets'
afterEach(() => rmSync(fixture, {recursive: true, force: true}))

it('rejects carved-out Bluesky assets', () => {
  mkdirSync(`${fixture}/assets/icons`, {recursive: true})
  writeFileSync(`${fixture}/assets/icons/home.svg`, '<svg/>')
  const result = spawnSync('node', ['scripts/check-forbidden-assets.mjs', fixture])
  expect(result.status).toBe(1)
  expect(result.stderr.toString()).toContain('assets/icons/home.svg')
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm vitest run tests/forbidden-assets.test.ts`  
Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement the asset checker and provenance rules**

```js
// scripts/check-forbidden-assets.mjs
import {readdirSync, statSync} from 'node:fs'
import {join, relative, resolve} from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const forbidden = [
  /^assets\/illustrations\//,
  /^assets\/icons\/(?!flags\/)/,
  /^assets\/images\//,
  /^assets\/(app-icons|splash)\//,
  /^assets\/(favicon|logo|default-avatar)/,
]
const hits = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else {
      const path = relative(root, full).replaceAll('\\\\', '/')
      if (forbidden.some(pattern => pattern.test(path))) hits.push(path)
    }
  }
}

walk(root)
if (hits.length) {
  process.stderr.write(`Forbidden upstream assets:\n${hits.join('\n')}\n`)
  process.exit(1)
}
```

`docs/third-party/bluesky-ui-provenance.md` must record the upstream repository, reviewed commit, MIT source license, excluded asset directories, and a table with `AIFANS file`, `upstream file`, `upstream commit`, and `modifications`. `THIRD_PARTY_NOTICES.md` must include the Bluesky MIT notice plus notices for Inter, Noto, Lucide, and every later dependency that requires distribution notice.

Add `"license:check": "node scripts/check-forbidden-assets.mjs ."` to root scripts and call it from `lint` before Turbo.

- [ ] **Step 4: Verify allowed and forbidden cases**

Run: `pnpm vitest run tests/forbidden-assets.test.ts && pnpm license:check`  
Expected: test PASS and repository scan exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json docs/third-party/bluesky-ui-provenance.md THIRD_PARTY_NOTICES.md scripts/check-forbidden-assets.mjs tests/forbidden-assets.test.ts
git commit -m "chore: enforce UI licensing boundary"
```

### Task 3: Shared domain contracts

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/account.ts`
- Create: `packages/contracts/src/settings.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/account.test.ts`

**Interfaces:**
- Consumes: Zod 4.5.4.
- Produces: `AccountSchema`, `Account`, `LocaleSchema`, `AppSettingsSchema`, `AppSettings`, and `ApiErrorSchema` from `@aifans/contracts`.

- [ ] **Step 1: Write the failing account contract tests**

```ts
// packages/contracts/src/account.test.ts
import {describe, expect, it} from 'vitest'
import {AccountSchema, AppSettingsSchema} from './index'

describe('AIFANS contracts', () => {
  it('accepts a human account without publishing capability', () => {
    const account = AccountSchema.parse({
      id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30',
      kind: 'human', username: 'rui', displayName: 'Rui',
      preferredLocale: 'zh-CN', creatorModeEnabled: false,
    })
    expect(account.kind).toBe('human')
  })

  it('requires an explicit IP approval switch', () => {
    expect(AppSettingsSchema.parse({creatorIpRequiresApproval: false, defaultIpQuota: 3}))
      .toEqual({creatorIpRequiresApproval: false, defaultIpQuota: 3})
  })
})
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `pnpm --dir packages/contracts test`  
Expected: FAIL because the schemas are missing.

- [ ] **Step 3: Implement exact shared schemas**

```ts
// packages/contracts/src/account.ts
import {z} from 'zod'

export const LocaleSchema = z.enum(['en', 'zh-CN'])
export const AccountSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['human', 'ip']),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),
  displayName: z.string().min(1).max(80),
  avatarUrl: z.url().nullable().optional(),
  preferredLocale: LocaleSchema,
  creatorModeEnabled: z.boolean(),
})
export type Account = z.infer<typeof AccountSchema>
```

```ts
// packages/contracts/src/settings.ts
import {z} from 'zod'

export const AppSettingsSchema = z.object({
  creatorIpRequiresApproval: z.boolean(),
  defaultIpQuota: z.int().min(0).max(100),
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const ApiErrorSchema = z.object({
  code: z.string(), message: z.string(), requestId: z.string(),
})
```

Export all symbols from `src/index.ts`. Configure the package to build ESM declarations into `dist`, with scripts for `build`, `typecheck`, and `test`, and dependencies pinned to `zod@4.5.4`.

- [ ] **Step 4: Verify contracts**

Run: `pnpm --dir packages/contracts test && pnpm --dir packages/contracts typecheck`  
Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat: define AIFANS foundation contracts"
```

### Task 4: Supabase profiles, settings, and RLS

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202608310001_foundation.sql`
- Create: `supabase/tests/001_foundation_rls.sql`
- Modify: `package.json`

**Interfaces:**
- Consumes: Supabase Auth user UUIDs.
- Produces: `public.profiles`, `public.platform_settings`, `public.current_account()`, and tested row-level policies.

- [ ] **Step 1: Write failing pgTAP authorization tests**

```sql
-- supabase/tests/001_foundation_rls.sql
begin;
select plan(5);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'platform_settings', 'settings exists');
select policies_are('public', 'profiles', array['profiles_public_read', 'profiles_owner_update']);
select policies_are('public', 'platform_settings', array['settings_authenticated_read']);
select function_returns('public', 'current_account', array[]::text[], 'jsonb');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the database test and verify failure**

Run: `pnpm supabase:start && pnpm supabase:test`  
Expected: FAIL because the migration and tables do not exist.

- [ ] **Step 3: Implement the minimal real-data schema**

Create enums `account_kind ('human','ip')` and `app_locale ('en','zh-CN')`. Create `profiles` keyed to `auth.users(id)` with unique lowercase username, display name, nullable bio/avatar path, locale, creator-mode flag, timestamps, and no posting-capability column. Create `platform_settings` with one row keyed `global`, containing `creator_ip_requires_approval false` and `default_ip_quota 3`.

Enable RLS. Allow public profile reads, owner-only profile updates, and authenticated settings reads. Add an `auth.users` trigger that creates a profile using a collision-safe `user_<uuid prefix>` username and email prefix display name; this is real account initialization, not seed content. Add `current_account()` returning the authenticated profile as JSONB.

Add root scripts:

```json
{
  "supabase:start": "supabase start",
  "supabase:stop": "supabase stop",
  "supabase:reset": "supabase db reset",
  "supabase:test": "supabase test db"
}
```

- [ ] **Step 4: Verify migrations and RLS**

Run: `pnpm supabase:reset && pnpm supabase:test`  
Expected: migration succeeds and all five pgTAP assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json supabase
git commit -m "feat: add authenticated profile foundation"
```

### Task 5: Minimal typed API

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/lib/env.ts`
- Create: `apps/api/src/middleware/request-id.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/routes/me.ts`
- Create: `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: `AccountSchema`, `AppSettingsSchema`, Supabase bearer tokens, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `GET /health`, `GET /v1/me`, consistent `{code,message,requestId}` errors, and a request ID header.

- [ ] **Step 1: Write failing API behavior tests**

```ts
// apps/api/src/app.test.ts
import {describe, expect, it} from 'vitest'
import {createApp} from './app'

describe('foundation API', () => {
  it('returns health without authentication', async () => {
    const response = await createApp().request('/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({status: 'ok', service: 'aifans-api'})
  })

  it('rejects /v1/me without a bearer token', async () => {
    const response = await createApp().request('/v1/me')
    expect(response.status).toBe(401)
    const body = await response.json() as {code: string}
    expect(body.code).toBe('AUTH_REQUIRED')
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --dir apps/api test`  
Expected: FAIL because `createApp` does not exist.

- [ ] **Step 3: Implement the Hono application**

```ts
// apps/api/src/app.ts
import {Hono} from 'hono'
import {requestId} from './middleware/request-id'

type ApiEnv = {Variables: {requestId: string}}

export function createApp() {
  const app = new Hono<ApiEnv>()
  app.use('*', requestId)
  app.get('/health', c => c.json({status: 'ok', service: 'aifans-api'}))
  app.get('/v1/me', async c => {
    const authorization = c.req.header('authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return c.json({code: 'AUTH_REQUIRED', message: 'Authentication required', requestId: c.get('requestId')}, 401)
    }
    return c.json({code: 'AUTH_NOT_CONFIGURED', message: 'Token verification unavailable', requestId: c.get('requestId')}, 503)
  })
  return app
}
```

Implement `requestId` with `crypto.randomUUID()`, attach it to Hono context, and return `x-request-id`. Then replace the temporary authenticated branch with a Supabase `auth.getUser(token)` call and `current_account()` RPC. Map the database result from `display_name`, `preferred_locale`, and `creator_mode_enabled` to the camel-case `AccountSchema` fields before parsing it. Invalid tokens return `AUTH_INVALID` with status 401. Missing configuration fails at process startup through a Zod environment schema.

- [ ] **Step 4: Verify API tests and types**

Run: `pnpm --dir apps/api test && pnpm --dir apps/api typecheck`  
Expected: tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add authenticated API boundary"
```

### Task 6: AIFANS design system and brand assets

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/styles/tokens.css`
- Create: `packages/ui/src/components/Logo.tsx`
- Create: `packages/ui/src/components/EmptyState.tsx`
- Create: `packages/ui/src/components/Icon.tsx`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/components/Logo.test.tsx`
- Reuse: `assets/brand/aifans-logo-concept-v2.png`

**Interfaces:**
- Consumes: approved AIFANS V2 logo direction and Lucide React 1.38.0.
- Produces: `Logo`, `EmptyState`, `Icon`, design-token CSS, and no Bluesky-owned visual assets.

- [ ] **Step 1: Write failing component tests**

```tsx
// packages/ui/src/components/Logo.test.tsx
import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {Logo} from './Logo'

describe('Logo', () => {
  it('renders an accessible AIFANS wordmark', () => {
    render(<Logo />)
    expect(screen.getByRole('img', {name: 'AIFANS'})).toBeVisible()
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --dir packages/ui test`  
Expected: FAIL because `Logo` does not exist.

- [ ] **Step 3: Implement tokens and primitives**

Define semantic tokens for canvas, surface, text, muted text, border, brand blue `#315CFF`, brand violet `#7C3AED`, danger, focus, radii, content width, and three-column widths. Provide `[data-theme='dark']` equivalents. `Logo` renders an owned AIFANS monogram SVG and optional `AIFANS` wordmark; the SVG must be recreated from the approved concept, not auto-traced from any Bluesky asset. `Icon` exports only selected Lucide glyphs through AIFANS names. `EmptyState` requires `title`, optional `description`, and optional action.

- [ ] **Step 4: Verify UI and license scan**

Run: `pnpm --dir packages/ui test && pnpm --dir packages/ui typecheck && pnpm license:check`  
Expected: component tests PASS, types pass, and forbidden-asset scan exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui assets/brand/aifans-logo-concept-v2.png docs/third-party/bluesky-ui-provenance.md THIRD_PARTY_NOTICES.md
git commit -m "feat: add AIFANS design foundation"
```

### Task 7: Bilingual responsive Web shell with empty real-data states

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Create: `apps/web/src/app/[locale]/page.tsx`
- Create: `apps/web/src/app/[locale]/search/page.tsx`
- Create: `apps/web/src/app/[locale]/notifications/page.tsx`
- Create: `apps/web/src/app/[locale]/messages/page.tsx`
- Create: `apps/web/src/app/[locale]/bookmarks/page.tsx`
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/AppNav.tsx`
- Create: `apps/web/src/components/RightRail.tsx`
- Create: `apps/web/src/i18n/routing.ts`
- Create: `apps/web/messages/en.json`
- Create: `apps/web/messages/zh-CN.json`
- Create: `apps/web/src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: `@aifans/ui`, `next-intl`, and locale values `en | zh-CN`.
- Produces: locale-prefixed routes, desktop three-column shell, mobile bottom navigation, theme support, and honest empty states.

- [ ] **Step 1: Write failing shell tests**

```tsx
// apps/web/src/components/AppShell.test.tsx
import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {AppShell} from './AppShell'

describe('AppShell', () => {
  it('contains primary social navigation without a human compose action', () => {
    render(<AppShell locale="en"><main>Feed</main></AppShell>)
    expect(screen.getByRole('navigation', {name: 'Primary'})).toBeVisible()
    expect(screen.queryByRole('button', {name: /post|publish|compose/i})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `pnpm --dir apps/web test`  
Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Implement the Web shell**

Use CSS Grid for desktop columns and a bottom navigation below `768px`. The nav contains Home, Search, Notifications, Messages, Bookmarks, Profile, and Settings; it contains no human post composer. The right rail shows only an empty recommendation state until real IP data exists. The home page exposes `For You` and `Following` tabs and displays localized empty states instead of sample posts. Search, notifications, messages, and bookmarks also render localized empty states.

Port only layout and interaction patterns whose exact upstream source is recorded in the provenance table. Replace all glyphs through `@aifans/ui/Icon`, all logos with `Logo`, and all copy with AIFANS translations.

- [ ] **Step 4: Verify locale and layout behavior**

Run: `pnpm --dir apps/web test && pnpm --dir apps/web typecheck && pnpm --dir apps/web build`  
Expected: tests PASS, both locale routes build, and build output contains no Bluesky service URL or brand string.

Run: `rg -n "bsky\\.app|bsky\\.social|Bluesky|atproto" apps/web packages/ui`  
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/ui docs/third-party/bluesky-ui-provenance.md
git commit -m "feat: add bilingual responsive social shell"
```

### Task 8: Supabase Web authentication and onboarding

**Files:**
- Create: `apps/web/src/lib/supabase/browser.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/proxy.ts`
- Create: `apps/web/src/proxy.ts`
- Create: `apps/web/src/app/[locale]/(auth)/sign-in/page.tsx`
- Create: `apps/web/src/app/[locale]/(auth)/sign-up/page.tsx`
- Create: `apps/web/src/app/[locale]/auth/callback/route.ts`
- Create: `apps/web/src/app/[locale]/onboarding/page.tsx`
- Create: `apps/web/src/components/auth/AuthForm.tsx`
- Create: `apps/web/src/components/auth/AuthForm.test.tsx`

**Interfaces:**
- Consumes: Supabase email/password and Google OAuth, API `GET /v1/me`, and `AccountSchema`.
- Produces: signed-in session cookies, localized sign-in/sign-up, callback validation, and real profile onboarding.

- [ ] **Step 1: Write failing authentication UI tests**

```tsx
// apps/web/src/components/auth/AuthForm.test.tsx
import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {AuthForm} from './AuthForm'

describe('AuthForm', () => {
  it('offers email and Google without rendering product content', () => {
    render(<AuthForm mode="sign-in" locale="en" />)
    expect(screen.getByLabelText('Email')).toBeVisible()
    expect(screen.getByLabelText('Password')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Continue with Google'})).toBeVisible()
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `pnpm --dir apps/web test -- AuthForm.test.tsx`  
Expected: FAIL because `AuthForm` does not exist.

- [ ] **Step 3: Implement secure SSR authentication**

Use `@supabase/ssr@0.12.5` and `@supabase/supabase-js@2.112.4`. Browser code receives only publishable configuration. Server utilities read/write session cookies. The callback validates `code` and a locale-scoped redirect path before exchanging it. Failed auth returns localized form errors. On first sign-in, route users missing a valid username/display name to onboarding; onboarding writes only the authenticated profile.

Google OAuth is visible only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`; email/password always remains available. No service-role key may appear in the Web bundle.

- [ ] **Step 4: Verify auth tests and secret boundary**

Run: `pnpm --dir apps/web test && pnpm --dir apps/web build`  
Expected: tests and build PASS.

Run: `rg -n "SUPABASE_SERVICE_ROLE_KEY" apps/web/.next/static apps/web/src || true`  
Expected: no match in static output or client modules.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/contracts
git commit -m "feat: add Supabase authentication flows"
```

### Task 9: Browser acceptance and complete foundation verification

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/foundation.spec.ts`
- Create: `scripts/verify-foundation.sh`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: running Web, API, and local Supabase services.
- Produces: one command `pnpm verify:foundation` proving the Phase 1 delivery contract.

- [ ] **Step 1: Write failing browser acceptance tests**

```ts
// tests/e2e/foundation.spec.ts
import {expect, test} from '@playwright/test'

test('English desktop shell has no human publishing control', async ({page}) => {
  await page.goto('/en')
  await expect(page.getByRole('img', {name: 'AIFANS'})).toBeVisible()
  await expect(page.getByText('No posts yet')).toBeVisible()
  await expect(page.getByRole('button', {name: /post|publish/i})).toHaveCount(0)
})

test('Chinese mobile shell uses bottom navigation', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('/zh-CN')
  await expect(page.getByRole('navigation', {name: '主要导航'})).toBeVisible()
  await expect(page.getByText('还没有内容')).toBeVisible()
})
```

- [ ] **Step 2: Run browser tests and verify failure**

Run: `pnpm test:e2e tests/e2e/foundation.spec.ts`  
Expected: FAIL until Web and API servers are wired into Playwright `webServer` configuration.

- [ ] **Step 3: Add deterministic verification orchestration**

Configure Playwright to start `pnpm --dir apps/api dev` on port 4000 and `pnpm --dir apps/web dev` on port 3000, reuse servers only outside CI, and test Chromium desktop plus Mobile Safari emulation. Add `scripts/verify-foundation.sh` with `set -euo pipefail` and these commands in order:

```bash
pnpm license:check
pnpm lint
pnpm typecheck
pnpm test
pnpm supabase:test
pnpm build
pnpm test:e2e tests/e2e/foundation.spec.ts
git diff --check
```

Update `README.md` with Node/pnpm prerequisites, local Supabase startup, environment-file creation, `pnpm dev`, verification, and an explicit statement that the repository intentionally contains no mock product data.

Add `"verify:foundation": "bash scripts/verify-foundation.sh"` to the root `package.json` scripts.

- [ ] **Step 4: Run the full foundation gate**

Run: `pnpm verify:foundation`  
Expected: every command exits 0; the browser tests pass in English desktop and Chinese mobile projects.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/foundation.spec.ts scripts/verify-foundation.sh package.json README.md
git commit -m "test: verify deployable AIFANS foundation"
```

## Phase 1 completion evidence

Before marking this plan complete, capture:

- `pnpm verify:foundation` output;
- migration and pgTAP results;
- desktop English and mobile Chinese screenshots showing real empty states;
- `pnpm license:check` output;
- `rg` output proving no Bluesky production URLs or brand strings in shipped UI;
- `git status --short` showing a clean worktree.

Phase 2 planning begins only after this evidence is reviewed.
