# AIFANS Admin Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AIFANS operator pages a separate navigation shell and return authenticated operators to the admin route that initiated sign-in.

**Architecture:** Keep the existing URLs and page files. A pathname-aware `AppShell` selects either the existing consumer shell or a focused `AdminShell`; the auth page accepts only two same-locale admin return paths and passes that validated target through email and Google sign-in.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Neon Auth, Vitest, Testing Library.

## Global Constraints

- Admin routes remain `/[locale]/admin` and `/[locale]/admin/creator`.
- Server-side `GET /v1/admin/access` authorization and `force-dynamic` rendering remain mandatory.
- Admin navigation contains only content operations, Creator review, return to user site, and sign out.
- No analytics, user management, system settings, database changes, or new roles.
- Return targets must be closed to the two current-locale admin paths.

---

### Task 1: Safe admin sign-in return

**Files:**
- Create: `apps/web/src/lib/auth/return-to.ts`
- Test: `apps/web/src/lib/auth/return-to.test.tsx`
- Modify: `apps/web/src/app/[locale]/auth/[view]/page.tsx`
- Modify: `apps/web/src/components/auth/AuthPanel.tsx`
- Modify: `apps/web/src/components/auth/AuthPanel.test.tsx`
- Modify: `apps/web/src/app/[locale]/admin/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/creator/page.tsx`

**Interfaces:**
- Produces: `readAdminReturnTo(locale: Locale, value: string | string[] | undefined): string | undefined`.
- `AuthPanel` gains optional `returnTo?: string`; `createBrowserAuthActions(locale, returnTo?)` uses the validated target after email or Google sign-in.

- [ ] **Step 1: Write failing return-target and auth-action tests**

```ts
expect(readAdminReturnTo('zh-CN', '/zh-CN/admin')).toBe('/zh-CN/admin')
expect(readAdminReturnTo('zh-CN', '/zh-CN/admin/creator')).toBe('/zh-CN/admin/creator')
expect(readAdminReturnTo('zh-CN', 'https://attacker.example')).toBeUndefined()
expect(readAdminReturnTo('zh-CN', '/en/admin')).toBeUndefined()
```

Assert sign-in uses `window.location.assign(returnTo)` and Google receives `callbackURL: returnTo`.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm --dir apps/web exec vitest run src/lib/auth/return-to.test.tsx src/components/auth/AuthPanel.test.tsx`

Expected: FAIL because `readAdminReturnTo` and the `returnTo` behavior do not exist.

- [ ] **Step 3: Implement the closed return target**

```ts
export function readAdminReturnTo(locale: Locale, value: string | string[] | undefined) {
  if (typeof value !== 'string') return undefined
  const allowed = new Set([`/${locale}/admin`, `/${locale}/admin/creator`])
  return allowed.has(value) ? value : undefined
}
```

Parse `searchParams.next` on the auth page, pass it into `AuthPanel`, preserve it in login/register links, and use it for email and Google completion. Change both admin redirects to append an encoded `next` value.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `corepack pnpm --dir apps/web exec vitest run src/lib/auth/return-to.test.tsx src/components/auth/AuthPanel.test.tsx src/app/'[locale]'/admin/page.test.tsx src/app/'[locale]'/admin/creator/page.test.tsx`

Expected: all selected tests pass.

### Task 2: Separate operator shell

**Files:**
- Create: `apps/web/src/components/admin/AdminShell.tsx`
- Test: `apps/web/src/components/admin/AdminShell.test.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/AppShell.test.tsx`
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- `AppShell` receives `creatorModeEnabled: boolean` and `authConfigured: boolean` from the server layout.
- `AdminShell` receives `{locale, authConfigured, contentLabel, reviewLabel, children}`.

- [ ] **Step 1: Write failing shell tests**

```tsx
usePathnameMock.mockReturnValue('/zh-CN/admin')
render(<AppShell authConfigured creatorModeEnabled labels={zh} locale="zh-CN"><p>content</p></AppShell>)
expect(screen.getByRole('link', {name: '运营控制台'})).toHaveAttribute('href', '/zh-CN/admin')
expect(screen.getByRole('link', {name: '创作者审核'})).toHaveAttribute('href', '/zh-CN/admin/creator')
expect(screen.queryByRole('link', {name: '搜索'})).not.toBeInTheDocument()
```

Cover desktop/mobile navigation, active state, return-to-site, and sign-out account control.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm --dir apps/web exec vitest run src/components/AppShell.test.tsx src/components/admin/AdminShell.test.tsx`

Expected: FAIL because admin shell selection and component do not exist.

- [ ] **Step 3: Implement pathname shell selection**

Make `AppShell` a client boundary using `usePathname()`. For `/${locale}/admin` and descendants render `AdminShell`; otherwise render the existing navigation/right rail/mobile navigation. Compute Creator rollout and Auth configuration in the server locale layout and pass booleans into the boundary.

- [ ] **Step 4: Add responsive monochrome admin styles**

Add `.admin-shell`, `.admin-nav`, `.admin-nav-link`, `.admin-main`, and mobile equivalents using existing tokens, 44px minimum targets, visible focus state, and existing `768px` breakpoint.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `corepack pnpm --dir apps/web exec vitest run src/components/AppShell.test.tsx src/components/admin/AdminShell.test.tsx`

Expected: all selected tests pass.

### Task 3: Full verification and deployment

**Files:**
- Verify only; no new production scope.

**Interfaces:**
- Consumes the completed safe return flow and shell selection.
- Produces a production deployment where admin navigation never falls back to the consumer shell.

- [ ] **Step 1: Run repository gates**

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm build && corepack pnpm license:check && git diff --check`

Expected: zero failures; Next build lists both admin routes as dynamic.

- [ ] **Step 2: Commit and push**

```bash
git add apps/web docs/superpowers/plans/2026-09-01-aifans-admin-shell.md
git commit -m "feat(web): isolate operator console navigation"
git push origin HEAD:main HEAD:codex/aifans-foundation
```

- [ ] **Step 3: Production smoke**

Verify anonymous `/zh-CN/admin` redirects to `/zh-CN/auth/sign-in?next=%2Fzh-CN%2Fadmin`; after operator sign-in the browser returns to `/zh-CN/admin`; the two admin links remain within admin; return-to-site opens `/zh-CN`.
