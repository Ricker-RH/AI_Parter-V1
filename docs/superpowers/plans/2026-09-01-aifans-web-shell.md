# AIFANS Web Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first production-quality AIFANS Web application with bilingual locale routes, responsive social navigation, light/dark themes, and honest empty states.

**Architecture:** A Next.js App Router application owns route composition and localization while `@aifans/ui` owns shared brand primitives and tokens. Page components render product states through local view components and do not import database, authentication-provider, Dify, or storage SDKs. Authentication and live social data attach through typed adapters in later vertical slices without changing the shell.

**Tech Stack:** Node.js 24.19.0, pnpm 11.21.0, TypeScript 7.0.2, Next.js 16.3.3, React 19.2.8, next-intl 4.14.1, next-themes 0.4.6, Vitest 4.1.11, Testing Library React 16.3.2, jsdom 29.0.1, `@aifans/ui`.

## Global Constraints

- Humans cannot publish top-level posts; no compose control appears in the user Web shell.
- Chinese and English, desktop and mobile Web, and light and dark themes ship together.
- Production and development contain no seeded mock users, IPs, posts, comments, counters, or chat data.
- AIFANS uses its own logo and Lucide-backed icons; no excluded Bluesky assets or brands enter the repository.
- Page components do not import Neon, PostgreSQL, Drizzle, Neon Auth, Dify, or storage SDKs.
- Dependencies are pinned exactly and behavior follows RED to GREEN TDD.

---

### Task 1: Responsive bilingual social shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Create: `apps/web/src/app/[locale]/page.tsx`
- Create: `apps/web/src/app/[locale]/search/page.tsx`
- Create: `apps/web/src/app/[locale]/notifications/page.tsx`
- Create: `apps/web/src/app/[locale]/messages/page.tsx`
- Create: `apps/web/src/app/[locale]/bookmarks/page.tsx`
- Create: `apps/web/src/app/[locale]/profile/page.tsx`
- Create: `apps/web/src/app/[locale]/settings/page.tsx`
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/AppNav.tsx`
- Create: `apps/web/src/components/MobileNav.tsx`
- Create: `apps/web/src/components/RightRail.tsx`
- Create: `apps/web/src/components/ThemeProvider.tsx`
- Create: `apps/web/src/i18n/config.ts`
- Create: `apps/web/messages/en.json`
- Create: `apps/web/messages/zh-CN.json`
- Test: `apps/web/src/components/AppShell.test.tsx`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `Logo`, `Icon`, `EmptyState`, and design tokens from `@aifans/ui`; locale union `en | zh-CN`.
- Produces: locale-prefixed AIFANS routes and `AppShell({locale, labels, children})` with desktop and mobile navigation.

- [ ] **Step 1: Write the failing shell contract test**

```tsx
import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {AppShell} from './AppShell.js'

const labels = {
  primary: 'Primary', home: 'Home', search: 'Search', notifications: 'Notifications',
  messages: 'Messages', bookmarks: 'Bookmarks', profile: 'Profile', settings: 'Settings',
  recommendations: 'Recommendations', recommendationsEmpty: 'No recommendations yet',
}

describe('AppShell', () => {
  it('renders complete social navigation without a human compose action', () => {
    render(<AppShell locale="en" labels={labels}><main>Feed</main></AppShell>)
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0)
    expect(screen.getByText('Feed')).toBeVisible()
    expect(screen.queryByRole('button', {name: /post|publish|compose/i})).toBeNull()
  })

  it('prefixes navigation destinations with the selected locale', () => {
    render(<AppShell locale="zh-CN" labels={labels}><main>内容</main></AppShell>)
    expect(screen.getAllByRole('link', {name: 'Home'})[0]).toHaveAttribute('href', '/zh-CN')
    expect(screen.getAllByRole('link', {name: 'Messages'})[0]).toHaveAttribute('href', '/zh-CN/messages')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/web test -- AppShell.test.tsx
```

Expected: FAIL because `apps/web` and `AppShell` do not exist.

- [ ] **Step 3: Configure the exact Web package**

Use exact dependencies: `next@16.3.3`, `react@19.2.8`, `react-dom@19.2.8`, `next-intl@4.14.1`, `next-themes@0.4.6`, and workspace `@aifans/ui`; exact development dependencies `@testing-library/jest-dom@6.9.1`, `@testing-library/react@16.3.2`, `@types/node@24.13.3`, `@types/react@19.2.14`, `@types/react-dom@19.2.3`, `jsdom@29.0.1`, `typescript@7.0.2`, and `vitest@4.1.11`. Scripts are `dev`, `build`, `lint`, `typecheck`, and `test`; Vitest uses project name `web`, `jsdom`, `src/**/*.test.tsx`, and `src/test/setup.ts`, which imports `@testing-library/jest-dom/vitest`.

- [ ] **Step 4: Implement localization and route composition**

Define `locales = ['en', 'zh-CN'] as const`, redirect `/` to `/en`, reject unsupported locale parameters with `notFound()`, load the matching JSON message file on the server, and set `<html lang={locale} suppressHydrationWarning>`. Every user-facing string must come from the locale message file; both files must expose identical keys.

- [ ] **Step 5: Implement the refined editorial shell**

Import `@aifans/ui/styles/tokens.css` from `globals.css`. Build a restrained content-first shell using existing AIFANS color, spacing, radius, and elevation tokens. Desktop width is capped by the shared layout token and uses a 248px navigation rail, fluid content column, and 320px right rail. Below 1024px hide the right rail; below 768px hide desktop navigation and show a fixed mobile bottom navigation. Use the AIFANS mark, semantic headings, visible keyboard focus, 44px minimum mobile targets, and active-link styling. Do not add a compose/post/publish control.

- [ ] **Step 6: Implement honest empty pages**

Home provides `For You` and `Following` tabs with a localized no-posts state. Search, notifications, messages, bookmarks, and profile render polished localized empty states without names, avatars, posts, counters, or example content. Settings renders only real locale and theme controls. The recommendations rail renders an honest no-recommendations state.

- [ ] **Step 7: Verify package and root behavior**

Run:

```bash
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm install
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/web test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/web typecheck
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm --dir apps/web build
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm test
PATH="/Users/luoruihao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" corepack pnpm license:check
rg -n "bsky\\.app|bsky\\.social|Bluesky|atproto|SUPABASE|DATABASE_(USER|ADMIN)_URL|DIFY_API_KEY" apps/web || true
git diff --check
```

Expected: focused tests, typecheck, build, root tests, and license scan pass; the source scan returns no forbidden provider, credential, or Bluesky strings; diff check is clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: add bilingual responsive Web shell"
```
