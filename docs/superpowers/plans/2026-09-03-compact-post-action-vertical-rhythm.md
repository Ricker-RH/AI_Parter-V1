# Compact Post Action Vertical Rhythm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the vertical space around the four shared post actions on feed and detail cards without reducing their accessible interaction targets.

**Architecture:** Keep `PostActions` and `PostCard` markup unchanged. Encode the spacing contract in the shared stylesheet so every feed, collection, profile, search, and detail consumer inherits one rule, then lock the base and phone breakpoint values with the existing stylesheet regression test.

**Tech Stack:** Next.js 16, React 19, CSS, Vitest, Testing Library.

---

### Task 1: Lock and implement the shared vertical rhythm

**Files:**
- Modify: `apps/web/src/components/social/PostActions.test.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Write the failing stylesheet regression test**

Add this test inside the existing `describe('PostActions', ...)` block in `PostActions.test.tsx`:

```tsx
it('keeps feed and detail action rows vertically compact without shrinking touch targets', () => {
  const stylesheet = readFileSync(
    process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css',
    'utf8',
  )

  expect(stylesheet).toMatch(/\.post-card\s*\{[^}]*padding:\s*16px 24px 8px/)
  expect(stylesheet).toMatch(/\.post-actions\s*\{[^}]*margin-top:\s*0/)
  expect(stylesheet).toMatch(/@media \(max-width: 699px\)[\s\S]*?\.post-card\s*\{\s*padding:\s*12px 12px 8px;\s*\}/)
  expect(stylesheet).toMatch(/\.post-action\s*\{[^}]*min-height:\s*44px/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- PostActions.test.tsx
```

Expected: FAIL because the current stylesheet uses `padding: 16px 24px`, `margin-top: 8px`, and phone `padding: 12px`.

- [ ] **Step 3: Implement the minimal shared CSS change**

Change the shared rules in `apps/web/src/app/globals.css` to:

```css
.post-card {
  border-bottom: 1px solid var(--shell-border);
  padding: 16px 24px 8px;
  position: relative;
}
```

```css
.post-actions {
  align-items: stretch;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 0;
  min-width: 0;
}
```

Inside `@media (max-width: 699px)`, change the existing post-card override to:

```css
.post-card { padding: 12px 12px 8px; }
```

Do not change `.post-action` height, component markup, media sizing, divider styling, or error-feedback flow.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: `PostActions.test.tsx` passes with zero failures.

- [ ] **Step 5: Run focused social-component regression tests**

Run:

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- PostActions.test.tsx PostCard.test.tsx SocialContent.test.tsx
```

Expected: all selected test files pass.

- [ ] **Step 6: Check the patch and commit it**

Run:

```bash
git diff --check
git diff -- apps/web/src/app/globals.css apps/web/src/components/social/PostActions.test.tsx
git add apps/web/src/app/globals.css apps/web/src/components/social/PostActions.test.tsx
git commit -m "fix(web): tighten post action vertical rhythm"
```

Expected: only the shared spacing rules and their regression test are committed.

### Task 2: Independent verification and Preview release

**Files:**
- Verify only; no expected source edits.

- [ ] **Step 1: Run workspace verification**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm test
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm typecheck
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" WEB_API_RATE_LIMIT_SIGNING_SECRET=local_validation_secret_32_chars__ pnpm build
git diff --check
```

Expected: tests, typecheck, production build, and whitespace validation exit successfully.

- [ ] **Step 2: Push and verify Preview**

Push `codex/ux-slice-0-1`, wait until the API and Web Preview deployments for the same SHA are Ready, and visually inspect the stable Web Preview at desktop and phone widths. Confirm a media feed card, a text-only feed card, and the corresponding detail page have compact action-to-content and action-to-divider spacing while all four actions remain operable.
