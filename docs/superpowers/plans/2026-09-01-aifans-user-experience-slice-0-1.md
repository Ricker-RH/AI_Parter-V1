# AIFANS User Experience Slice 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the secure, measurable foundation and first complete ordinary-user vertical slice: trusted mutation proxying, browser/performance gates, route-aware shells, anonymous Home, full-page Auth, responsive navigation, structured loading, and a refined real-data Home feed.

**Architecture:** Keep the current Next.js 16, React 19, Hono, Neon, PostHog, and typed workspace contracts. Add one signed Web-to-API rate-limit identity, route-aware shell selection, centralized safe Auth return paths, and capability-aware navigation. Preserve server-rendered real data while introducing Suspense/loading boundaries, strict client-side performance events, and deterministic browser checks.

**Tech Stack:** Node.js 24.19.0, pnpm 11.21.0, TypeScript 7.0.2, Next.js 16.3.3, React 19.2.8, Hono 4.13.5, Zod 4.5.4, Neon Auth, PostHog 1.422.5, Vitest 4.1.11, Testing Library 16.3.2, Playwright 1.62.1.

---

## Scope and ownership

This plan implements only Slice 0 and Slice 1 from the approved design. Search data, Liked, persistent chat, notification redesign, reports, multi-column Home, mute, and block remain outside this plan.

Work is divided to avoid overlapping ownership:

| Task | Primary ownership | Files it owns |
|---|---|---|
| 1 | Security worker | Web/API proxy identity, chat proxy, API rate limiter and env |
| 2 | Performance worker | Playwright foundation and performance analytics contracts |
| 3 | Shell/Auth worker | shell resolver, shell components, Auth return policy, protected pages |
| 4 | Navigation/Home worker | desktop/mobile navigation, Home selectors, messages, CSS and locale labels |
| 5 | Loading/media worker | loading/error boundaries, skeletons, navigation feedback, post media sizing |
| 6 | Primary integrator | cross-task review, full verification, real-browser evidence |

The primary integrator reviews every task before the next task edits shared files. Tasks 3–5 are executed sequentially because they intentionally touch the same shell and CSS surface.

Use the bundled runtime for every command:

```bash
export PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
```

## File structure

### New security and measurement units

- `apps/web/src/lib/rate-limit-identity.ts`: sign a short-lived anonymous client envelope from Vercel's trusted client-IP header.
- `apps/web/src/lib/analytics/performance.ts`: validate and emit privacy-safe performance measurements.
- `apps/web/src/components/PerformanceReporter.tsx`: connect Next Web Vitals and navigation measurements to the analytics client.
- `playwright.config.ts`: restrict Playwright to `tests/e2e` and define desktop/mobile projects.
- `tests/e2e/foundation.spec.ts`: anonymous Home, Auth-shell, responsive-shell, and safe-unavailable browser smoke tests.
- `tests/e2e/navigation-performance.spec.ts`: visible feedback, skeleton, warm navigation, and CLS measurements.

### New shell and loading units

- `apps/web/src/components/shell/route-shell.ts`: pure route-to-shell resolver.
- `apps/web/src/components/shell/PublicShell.tsx`: ordinary user shell.
- `apps/web/src/components/shell/AuthShell.tsx`: full-page authentication shell.
- `apps/web/src/components/shell/MessagesShell.tsx`: compact-rail message shell.
- `apps/web/src/components/shell/CreatorShell.tsx`: isolated Creator handoff shell.
- `apps/web/src/components/shell/LoadingScreen.tsx`: full-screen AIFANS entry state.
- `apps/web/src/components/shell/RouteSkeleton.tsx`: stable feed/list/detail skeletons.
- `apps/web/src/lib/auth/access-policy.ts`: protected destination list, safe return paths, and server redirect helper.
- `apps/web/src/components/MobileTopBar.tsx`: More/AIFANS/Search mobile header.
- `apps/web/src/components/GlobalMoreMenu.tsx`: working global More actions only.

Existing `AdminShell`, social repository contracts, RLS, PostCard, FeedContent, theme provider, and UI tokens remain the source of truth.

---

### Task 1: Secure Web-to-API mutation identity and chat proxy

**Files:**
- Create: `apps/web/src/lib/rate-limit-identity.ts`
- Test: `apps/web/src/lib/rate-limit-identity.test.tsx`
- Modify: `apps/web/src/lib/server-api.ts`
- Test: `apps/web/src/lib/server-api.test.tsx`
- Modify: `apps/web/src/app/api/chat/[ipProfileId]/messages/route.ts`
- Test: `apps/web/src/app/api/chat/[ipProfileId]/messages/route.test.tsx`
- Modify: `apps/api/src/middleware/rate-limit.ts`
- Modify: `apps/api/src/application.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/production.ts`
- Test: `apps/api/src/hardening.test.ts`
- Test: `apps/api/src/env.test.ts`
- Test: `apps/api/src/production.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing Web envelope tests**

Add tests for the exact envelope contract:

```ts
const headers = new Headers({'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1'})
const value = createRateLimitIdentity(headers, 1_788_200_000_000, 's'.repeat(32))
expect(value).toMatch(/^v1\.\d+\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
expect(value).not.toContain('203.0.113.7')
expect(createRateLimitIdentity(new Headers({'x-forwarded-for':'203.0.113.7'}), 1_788_200_000_000, 's'.repeat(32))).toBeNull()
```

Also assert that caller-supplied `x-aifans-rate-limit-identity`, raw IP headers, cookies, and authorization are never forwarded by `fetchAifansApi`; only the generated envelope, request ID, content type, and server-acquired bearer token may cross the boundary.

- [ ] **Step 2: Run the focused Web tests and verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/lib/rate-limit-identity.test.tsx src/lib/server-api.test.tsx
```

Expected: FAIL because `createRateLimitIdentity` and the outbound envelope do not exist.

- [ ] **Step 3: Implement the signed envelope and bounded chat body**

Implement this public surface:

```ts
export function createRateLimitIdentity(headers: Headers, nowMs: number, secret: string | undefined): string | null
```

The value is `v1.<epoch-minute>.<client-hash>.<signature>`, where both hashes use HMAC-SHA256 and the signature covers the complete preceding envelope. Accept only the first valid address from `x-vercel-forwarded-for`; do not trust `x-forwarded-for`.

Extend `fetchAifansApi` with an optional trusted client-header input used only by Next route handlers:

```ts
trustedClientHeaders?: Headers
```

Generate the envelope with server-only `WEB_API_RATE_LIMIT_SIGNING_SECRET`. Never forward a caller-supplied envelope.

In the chat proxy, reject missing or cross-origin `Origin` with `403 CSRF_REJECTED`. Read at most `32_768` bytes using a stream reader before JSON parsing. Return `413 PAYLOAD_TOO_LARGE` for declared or streamed overflow and preserve existing strict contract validation and safe 502/503 mapping.

- [ ] **Step 4: Write failing API verification tests**

Add assertions that:

```ts
expect(valid.status).not.toBe(503)
expect((await missing.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
expect((await expired.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
expect((await tampered.json()).code).toBe('RATE_LIMIT_IDENTITY_UNAVAILABLE')
expect(JSON.stringify(consume.mock.calls)).not.toContain('203.0.113.7')
```

The API must reject an unsigned mutation even when `x-forwarded-for` is present. Existing `429` plus `Retry-After` behavior stays unchanged.

- [ ] **Step 5: Implement API verification and production configuration**

Add `rateLimitIdentitySecret?: string` to `AppDependencies`. Parse the envelope, accept only the current or immediately previous epoch-minute, recompute the signature, and use `timingSafeEqual`. Hash the verified anonymous `client-hash` again with the existing `RATE_LIMIT_HMAC_SECRET` before calling the repository.

Add the server-only environment value:

```dotenv
WEB_API_RATE_LIMIT_SIGNING_SECRET=
```

Require the same minimum-32-character value in Web and API production environments. Do not expose it with `NEXT_PUBLIC_`. Production mutations fail closed when the identity is missing or invalid; local non-required apps retain existing test configurability.

- [ ] **Step 6: Run security verification and commit**

Run:

```bash
pnpm --dir apps/web exec vitest run src/lib/rate-limit-identity.test.tsx src/lib/server-api.test.tsx 'src/app/api/chat/[ipProfileId]/messages/route.test.tsx'
pnpm --dir apps/api exec vitest run src/hardening.test.ts src/env.test.ts src/production.test.ts
pnpm typecheck
git diff --check
```

Expected: all focused tests and typecheck pass; no raw IP, cookie, bearer token, or signing secret appears in logs or test snapshots.

Commit:

```bash
git add .env.example apps/web/src/lib apps/web/src/app/api/chat apps/api/src
git commit -m "fix: secure web api mutation identity"
```

---

### Task 2: Establish browser and privacy-safe performance gates

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/foundation.spec.ts`
- Create: `tests/e2e/performance-helpers.ts`
- Create: `apps/web/src/lib/analytics/performance.ts`
- Test: `apps/web/src/lib/analytics/performance.test.ts`
- Create: `apps/web/src/components/PerformanceReporter.tsx`
- Modify: `apps/web/src/lib/analytics/contracts.ts`
- Modify: `apps/web/src/lib/analytics/provider.tsx`
- Modify: `apps/web/src/lib/analytics/events.ts`
- Modify: `apps/web/src/app/[locale]/layout.tsx`

- [ ] **Step 1: Write failing strict performance-event tests**

Define one event named `performance_measured` with these properties only:

```ts
type PerformanceProperties = {
  locale: Locale
  route_name: AnalyticsRouteName
  metric: 'INP' | 'LCP' | 'CLS' | 'navigation' | 'interaction' | 'skeleton'
  metric_id: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  device_type: 'desktop' | 'tablet' | 'mobile'
  release: string
}
```

Tests reject unknown fields, non-finite/negative values, full URLs, queries, email, cookie, authorization, tokens, passwords, arbitrary route strings, and release or metric IDs outside a bounded ASCII pattern.

- [ ] **Step 2: Run the analytics tests and verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/lib/analytics/performance.test.ts src/lib/analytics/contracts.test.tsx src/lib/analytics/provider.test.tsx
```

Expected: FAIL because `performance_measured` and its validator are absent.

- [ ] **Step 3: Implement the reporter without enabling PostHog autocapture**

Keep `capture_performance: false`, `autocapture: false`, text masking, and the current denylist. Add the new event to the closed analytics contract and sanitizer. `PerformanceReporter` uses `useReportWebVitals` from `next/web-vitals`, maps the current pathname to the existing route-name allowlist, and silently drops unknown routes.

The component renders nothing:

```tsx
export function PerformanceReporter({locale, release}: {locale: Locale; release: string}) {
  useReportWebVitals((metric) => reportWebVital({analytics, locale, release, metric, pathname}))
  return null
}
```

Analytics failure must never delay or fail navigation.

- [ ] **Step 4: Add deterministic Playwright configuration**

Configure only `tests/e2e`:

```ts
export default defineConfig({
  testDir: './tests/e2e',
  use: {baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure'},
  projects: [
    {name: 'chromium-desktop', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}},
    {name: 'webkit-mobile', use: {...devices['iPhone 13'], viewport: {width: 390, height: 844}}},
  ],
  webServer: {command: 'pnpm --dir apps/web dev', url: 'http://127.0.0.1:3000/en', reuseExistingServer: !process.env.CI},
})
```

The foundation test verifies anonymous Home or its honest API-unavailable state, locale metadata, and mobile/desktop shell without inserting product mock data. Happy-path authenticated E2E waits for a preview environment in Task 6.

- [ ] **Step 5: Run foundation verification and commit**

Run:

```bash
pnpm --dir apps/web exec vitest run src/lib/analytics/performance.test.ts src/lib/analytics/contracts.test.tsx src/lib/analytics/provider.test.tsx
pnpm exec playwright test tests/e2e/foundation.spec.ts --project=chromium-desktop
pnpm exec playwright test tests/e2e/foundation.spec.ts --project=webkit-mobile
pnpm typecheck
git diff --check
```

Expected: Playwright scans no Vitest files; both browser projects run; analytics payloads contain no URL, query, text, account, cookie, token, or secret.

Commit:

```bash
git add playwright.config.ts tests/e2e apps/web/src/lib/analytics apps/web/src/components/PerformanceReporter.tsx apps/web/src/app/'[locale]'/layout.tsx
git commit -m "test: add browser and performance gates"
```

---

### Task 3: Add route-aware shells and centralized guest access

**Files:**
- Create: `apps/web/src/components/shell/route-shell.ts`
- Test: `apps/web/src/components/shell/route-shell.test.ts`
- Create: `apps/web/src/components/shell/PublicShell.tsx`
- Create: `apps/web/src/components/shell/AuthShell.tsx`
- Create: `apps/web/src/components/shell/MessagesShell.tsx`
- Create: `apps/web/src/components/shell/CreatorShell.tsx`
- Create: `apps/web/src/lib/auth/access-policy.ts`
- Test: `apps/web/src/lib/auth/access-policy.test.ts`
- Modify: `apps/web/src/lib/auth/return-to.ts`
- Test: `apps/web/src/lib/auth/return-to.test.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Test: `apps/web/src/components/AppShell.test.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/src/app/[locale]/search/page.tsx`
- Modify: `apps/web/src/app/[locale]/messages/page.tsx`
- Modify: `apps/web/src/app/[locale]/notifications/page.tsx`
- Modify: `apps/web/src/app/[locale]/bookmarks/page.tsx`
- Modify: `apps/web/src/app/[locale]/profile/page.tsx`
- Modify: `apps/web/src/app/[locale]/posts/[postId]/page.tsx`
- Modify: `apps/web/src/app/[locale]/profiles/[profileId]/page.tsx`
- Modify: `apps/web/src/app/[locale]/creator/page.tsx`
- Modify: `apps/web/src/app/[locale]/creator/[draftId]/page.tsx`

- [ ] **Step 1: Write failing shell and access-policy tests**

Lock the pure shell result:

```ts
expect(resolveShellKind('/en')).toBe('public')
expect(resolveShellKind('/en/auth/sign-in')).toBe('auth')
expect(resolveShellKind('/en/messages')).toBe('messages')
expect(resolveShellKind('/en/creator')).toBe('creator')
expect(resolveShellKind('/en/admin')).toBe('admin')
```

Lock safe return targets:

```ts
expect(readUserReturnTo('en', '/en/messages')).toBe('/en/messages')
expect(readUserReturnTo('en', '/en?feed=following&visualType=anime')).toBe('/en?feed=following&visualType=anime')
expect(readUserReturnTo('en', 'https://attacker.example')).toBeUndefined()
expect(readUserReturnTo('en', '//attacker.example')).toBeUndefined()
expect(readUserReturnTo('en', '/zh-CN/messages')).toBeUndefined()
```

Add an injectable server helper:

```ts
requireAuthenticatedPage({locale, returnTo, getToken, redirect})
```

It returns for a non-empty token and redirects to `/${locale}/auth/sign-in?next=...` for a missing token. It treats token-provider failure as the existing safe unavailable path, not authenticated success.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/components/shell/route-shell.test.ts src/lib/auth/access-policy.test.ts src/lib/auth/return-to.test.tsx src/components/AppShell.test.tsx
```

Expected: FAIL because shell resolver and user access policy do not exist.

- [ ] **Step 3: Implement shell selection**

`AppShell` becomes a small selector:

```tsx
switch (resolveShellKind(pathname)) {
  case 'auth': return <AuthShell>{children}</AuthShell>
  case 'messages': return <MessagesShell {...shellProps}>{children}</MessagesShell>
  case 'creator': return <CreatorShell {...shellProps}>{children}</CreatorShell>
  case 'admin': return <AdminShell authConfigured={authConfigured} locale={locale}>{children}</AdminShell>
  default: return <PublicShell {...shellProps}>{children}</PublicShell>
}
```

Auth renders no ordinary navigation, recommendation rail, or mobile bottom navigation. Messages always uses a compact icon rail and no recommendation rail. Creator and Admin retain isolated shells.

- [ ] **Step 4: Apply the centralized page guard**

Call `requireAuthenticatedPage` before protected fetches in Search, Messages, Notifications, Saved, My Profile, post detail, AI/IP profile detail, Creator root, and Creator draft. Home calls the same helper before a Following fetch. Anonymous For You remains the only ordinary-user page that fetches and renders content.

Do not cache token-bearing results. Preserve the existing admin-specific return-path allowlist and extend AuthPage to accept the separate safe user allowlist.

- [ ] **Step 5: Run shell/route verification and commit**

Run:

```bash
pnpm --dir apps/web exec vitest run src/components/shell/route-shell.test.ts src/lib/auth/access-policy.test.ts src/lib/auth/return-to.test.tsx src/components/AppShell.test.tsx 'src/app/[locale]/page.test.tsx' 'src/app/[locale]/messages/page.test.tsx' 'src/app/[locale]/auth/[view]/page.test.tsx'
pnpm --dir apps/web typecheck
git diff --check
```

Expected: anonymous For You renders; protected pages redirect before their data fetch; Auth, Messages, Creator, and Admin never render the Public shell.

Commit:

```bash
git add apps/web/src/components/shell apps/web/src/components/AppShell.tsx apps/web/src/lib/auth apps/web/src/app
git commit -m "feat(web): add route aware user shells"
```

---

### Task 4: Rebuild responsive navigation, full-page Auth, and Home selectors

**Files:**
- Create: `apps/web/src/components/MobileTopBar.tsx`
- Test: `apps/web/src/components/MobileTopBar.test.tsx`
- Create: `apps/web/src/components/GlobalMoreMenu.tsx`
- Test: `apps/web/src/components/GlobalMoreMenu.test.tsx`
- Modify: `apps/web/src/components/AppNav.tsx`
- Test: `apps/web/src/components/AppNav.test.tsx`
- Modify: `apps/web/src/components/MobileNav.tsx`
- Test: `apps/web/src/components/MobileNav.test.tsx`
- Modify: `apps/web/src/components/auth/AuthPanel.tsx`
- Test: `apps/web/src/components/auth/AuthPanel.test.tsx`
- Modify: `apps/web/src/components/social/FeedTabs.tsx`
- Test: `apps/web/src/components/social/FeedTabs.test.tsx`
- Modify: `apps/web/src/components/social/FeedContent.tsx`
- Test: `apps/web/src/components/social/SocialContent.test.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Test: `apps/web/src/app/[locale]/page.test.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh-CN.json`

- [ ] **Step 1: Write failing navigation and selector tests**

Assert the exact mobile order:

```ts
expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label')))
  .toEqual(['Home', 'Messages', 'Creator Center', 'Activity', 'My Profile'])
```

Assert desktop destination order for currently functional capabilities and a navigation model that can enable Liked only when Slice 2 lands. Assert no compose/post/publish control exists for a human.

For mobile Home, assert there is one tab row with the two feed destinations and no visual-type grouping:

```ts
expect(screen.getByRole('tab', {name: 'For You'})).toBeVisible()
expect(screen.getByRole('tab', {name: 'Following'})).toBeVisible()
expect(screen.queryByLabelText('IP style')).toBeNull()
```

No ordinary-user feed owns visual-type state. Legacy `visualType` input is ignored, removed from generated links, and never rendered as a grouping or filter.

- [ ] **Step 2: Run focused UI tests and verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/components/AppNav.test.tsx src/components/MobileNav.test.tsx src/components/MobileTopBar.test.tsx src/components/GlobalMoreMenu.test.tsx src/components/auth/AuthPanel.test.tsx src/components/social/FeedTabs.test.tsx src/components/social/SocialContent.test.tsx 'src/app/[locale]/page.test.tsx'
```

Expected: FAIL against the old generic shell, legacy visual-type filter, and card-style Auth.

- [ ] **Step 3: Implement navigation behavior**

At `>=1150px`, show the full sidebar. From `700px` through `1149px`, show the icon rail; hover and keyboard focus open an overlay label panel without moving content, while touch has an explicit open button. Below `700px`, show More/AIFANS/Search at the top and Home/Messages/Creator/Activity/Profile at the bottom.

Global More contains Appearance, Settings, Contact Us, and authenticated Sign Out. It supports Escape, outside click, focus restoration, keyboard traversal, and at least 44px touch targets. Contact uses a configured public destination or the existing safe unavailable state; no fake form is added.

- [ ] **Step 4: Implement Home selectors and full-page Auth styling**

Desktop uses For You and Following sidebar destinations and no visual-type row in the content column. It does not repeat For You/Following inside the feed. Mobile uses a single For You/Following tab row. Changing feeds removes `cursor`, retains locale, and removes legacy `visualType` input. Anonymous selection of Following invokes the safe Auth return path before any Following request.

Auth becomes a spacious full-page form with the existing email/password, Google, forgot/reset, sign-up, configured/unconfigured, pending, success, and failure behavior. Do not change Neon Auth semantics.

- [ ] **Step 5: Apply exact responsive tokens and localization**

Use these CSS gates and values:

```css
@media (max-width: 699px) { /* mobile */ }
@media (min-width: 700px) and (max-width: 1149px) { /* compact rail */ }
@media (min-width: 1150px) { /* full sidebar */ }
.content-column { width: min(100%, 640px); }
.post-card { padding-inline: 24px; }
@media (max-width: 699px) { .post-card { padding-inline: 12px; } }
```

Use a 36px avatar and approximately 12px avatar/content gap. Fix the undefined `--shell-bg` and `--border` references with existing AIFANS tokens. Remove the entire ordinary-user visual-type grouping without changing Creator/Admin visual-type metadata semantics. Add matching English and Chinese keys for Liked, Saved, Activity, Appearance, Contact, sign-out, menu states, and Auth return copy.

- [ ] **Step 6: Run UI verification and commit**

Run:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web typecheck
node -e "const fs=require('fs');const en=JSON.parse(fs.readFileSync('apps/web/messages/en.json'));const zh=JSON.parse(fs.readFileSync('apps/web/messages/zh-CN.json'));const walk=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?walk(v,p+k+'.'):[p+k]);const a=walk(en).sort(),b=walk(zh).sort();if(JSON.stringify(a)!==JSON.stringify(b))process.exit(1)"
git diff --check
```

Expected: all Web tests and typecheck pass; locale keys are identical; no ordinary-user visual-type grouping or human composer is rendered.

Commit:

```bash
git add apps/web/src/components apps/web/src/app/'[locale]'/page.tsx apps/web/src/app/globals.css apps/web/messages
git commit -m "feat(web): rebuild responsive navigation and home"
```

---

### Task 5: Add structured loading, navigation feedback, and stable media

**Files:**
- Create: `apps/web/src/components/shell/LoadingScreen.tsx`
- Test: `apps/web/src/components/shell/LoadingScreen.test.tsx`
- Create: `apps/web/src/components/shell/RouteSkeleton.tsx`
- Test: `apps/web/src/components/shell/RouteSkeleton.test.tsx`
- Create: `apps/web/src/components/NavigationFeedback.tsx`
- Test: `apps/web/src/components/NavigationFeedback.test.tsx`
- Create: `apps/web/src/app/loading.tsx`
- Create: `apps/web/src/app/[locale]/loading.tsx`
- Create: `apps/web/src/app/[locale]/error.tsx`
- Modify: `apps/web/src/components/AppNav.tsx`
- Modify: `apps/web/src/components/MobileNav.tsx`
- Modify: `apps/web/src/components/social/PostCard.tsx`
- Test: `apps/web/src/components/social/PostCard.test.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `tests/e2e/navigation-performance.spec.ts`

- [ ] **Step 1: Write failing loading and media tests**

Assert that entry loading contains only the full-screen AIFANS wordmark and an accessible status. RouteSkeleton variants `feed`, `list`, and `detail` have stable geometry and `aria-busy=true`. Reduced-motion styling removes looping animation.

For media, cover:

```ts
it.each([
  [{width: 1200, height: 800, aspectRatio: null}, '1200 / 800'],
  [{width: null, height: null, aspectRatio: 1.5}, '1.5'],
  [{width: null, height: null, aspectRatio: null}, '4 / 5'],
])('reserves media geometry', (media, expected) => {
  render(<PostCard post={createPost({media: [{...createMedia(), ...media}]})} />)
  expect(screen.getByTestId('post-media-frame')).toHaveStyle({aspectRatio: expected})
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/components/shell/LoadingScreen.test.tsx src/components/shell/RouteSkeleton.test.tsx src/components/NavigationFeedback.test.tsx src/components/social/PostCard.test.tsx
```

Expected: FAIL because loading units, visible navigation feedback, and legacy media fallback do not exist.

- [ ] **Step 3: Implement loading and error boundaries**

`app/loading.tsx` renders `LoadingScreen`. Locale loading keeps shell geometry and renders a content-shaped skeleton. The client `error.tsx` shows localized Retry and Home actions without rendering error details or stack traces.

Navigation links synchronously set a pending marker on pointer or keyboard activation. Clear it after pathname change and target main readiness. Announce the state without moving layout; report interaction/skeleton/navigation times through the strict event from Task 2.

- [ ] **Step 4: Implement stable media geometry**

Wrap every image in one shared media frame. Choose aspect ratio in this order:

1. valid positive width and height;
2. valid positive contract `aspectRatio`;
3. legacy fallback `4 / 5`.

Keep real alt text, lazy loading, and the current one-to-four-image grid. Never output a feed/detail image without a reserved ratio.

- [ ] **Step 5: Add browser performance assertions**

Measure from `pointerdown`/keyboard activation to the first animation frame containing pending UI, skeleton, and route-ready main. Collect layout-shift entries excluding `hadRecentInput`.

The test reports p50/p75/p95 and enforces:

```ts
expect(percentile(feedback, 0.75)).toBeLessThanOrEqual(100)
expect(percentile(skeleton, 0.75)).toBeLessThanOrEqual(150)
expect(percentile(warmNavigation, 0.75)).toBeLessThanOrEqual(800)
expect(percentile(cls, 0.75)).toBeLessThan(0.1)
```

Run at normal conditions and record a separate Slow 4G plus 4x CPU profile. A local environment without real API data verifies shell and unavailable-state timing; full data-route gates run against Preview in Task 6.

- [ ] **Step 6: Run focused verification and commit**

Run:

```bash
pnpm --dir apps/web exec vitest run src/components/shell/LoadingScreen.test.tsx src/components/shell/RouteSkeleton.test.tsx src/components/NavigationFeedback.test.tsx src/components/social/PostCard.test.tsx
pnpm exec playwright test tests/e2e/navigation-performance.spec.ts --project=chromium-desktop
pnpm --dir apps/web typecheck
git diff --check
```

Expected: loading/media component tests pass; local shell timing is recorded; media reserves layout before image load.

Commit:

```bash
git add apps/web/src tests/e2e/navigation-performance.spec.ts
git commit -m "perf(web): add route feedback and stable media"
```

---

### Task 6: Integrate, measure, and release Slice 0–1

**Files:**
- Modify only if evidence requires a fix: files owned by Tasks 1–5
- Create: `docs/performance/2026-09-01-home-baseline.md`
- Test: all workspace and browser suites

- [ ] **Step 1: Review task boundaries before merging changes**

Confirm:

```bash
git status --short
git log --oneline -8
git diff HEAD~5 --stat
```

Expected: only approved Slice 0–1 files and plan/spec documents changed. No Search backend, Liked API, chat persistence, notification migration, reports, multi-column implementation, mock product data, or secrets are present.

- [ ] **Step 2: Run static, unit, API, and contract gates**

Run:

```bash
pnpm license:check
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: license scan, all tests, 5-package typecheck, production build, and whitespace checks pass. The obsolete Next 16 `next lint` script is not treated as a substitute for these gates; fixing that existing script is a separate maintenance task unless it blocks the build.

- [ ] **Step 3: Run exact locale and secret scans**

Run:

```bash
node -e "const fs=require('fs');const en=JSON.parse(fs.readFileSync('apps/web/messages/en.json'));const zh=JSON.parse(fs.readFileSync('apps/web/messages/zh-CN.json'));const walk=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?walk(v,p+k+'.'):[p+k]);if(JSON.stringify(walk(en).sort())!==JSON.stringify(walk(zh).sort()))process.exit(1)"
rg -n "DATABASE_(USER|PLATFORM|PROVISIONING|RATE_LIMIT)_URL=|DIFY_API_KEY=|R2_SECRET_ACCESS_KEY=|POSTHOG_API_KEY=|WEB_API_RATE_LIMIT_SIGNING_SECRET=" . --glob '!node_modules/**' --glob '!.git/**' --glob '!*.example' || true
```

Expected: locale command exits zero; secret scan returns no committed values.

- [ ] **Step 4: Run local browser matrix**

Run the functional and performance suites, then inspect `375`, `430`, `699`, `700`, `768`, `1024`, `1149`, `1150`, and `1440` widths in Chinese/English and light/dark.

Verify:

- anonymous For You with no visual-type grouping;
- Following or protected route to full-page Auth;
- Auth has no Public shell;
- Messages always uses compact rail on non-mobile widths;
- mobile tab labels are `For You` and `Following` with no visual-type row or suffix menu;
- desktop and compact navigation order and expansion;
- no horizontal overflow or bottom-nav content obstruction;
- More menu Escape, outside click, focus restoration, and 44px targets;
- full-screen wordmark, structured skeleton, retry, and safe unavailable state;
- post media stable before load.

- [ ] **Step 5: Request minimum Preview credentials only when required**

Before real Preview measurements, request exactly:

- Vercel Preview access or deployment permission;
- the new shared `WEB_API_RATE_LIMIT_SIGNING_SECRET` configured server-side in Web and API;
- a Preview/branch Neon connection with the minimum read permission needed for `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`;
- a test human account session for authenticated flows.

Do not request R2, PostHog, or Dify secrets unless a test in this slice actually needs them. Never print or commit supplied values.

- [ ] **Step 6: Record Preview evidence**

For anonymous/authenticated, For You/Following, empty/25/50 posts, media/no-media, desktop/mobile, and normal/Slow 4G plus 4x CPU, record at least ten warm samples and p50/p75/p95 for:

- click feedback `<=100ms` p75;
- skeleton `<=150ms` p75 and 100% appearance;
- warm navigation `<=800ms` p75;
- INP `<200ms` p75;
- LCP `<2.5s` p75;
- CLS `<0.1` p75.

Record only route name, locale, device class, release, sample count, percentiles, failure rate, and sanitized database plan summaries. Do not record full URLs, queries, emails, post/comment text, cookies, tokens, or connection strings.

- [ ] **Step 7: Final review, commit evidence, and push**

Request a focused code review, fix verified findings, rerun affected gates, then commit:

```bash
git add docs/performance/2026-09-01-home-baseline.md
git commit -m "docs: record user experience baseline"
git status --short
git push origin main
```

Expected: worktree is clean and `main` is pushed only after all relevant gates pass. Vercel Preview/production deployment is observed until the new release is healthy.
