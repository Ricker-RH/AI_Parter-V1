# Threads-style Author Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the post-avatar author preview as a correctly layered, accessible Threads-style modal without changing its data or follow semantics.

**Architecture:** `AuthorPreview` will render its open overlay through `createPortal(..., document.body)` so post-card stacking contexts cannot trap the fixed scrim. The existing profile fetch, viewer scoping, follow action, focus trap, Escape handling, and trigger-focus restoration remain in the component; only modal mounting, dismissal markup, and visual hierarchy change.

**Tech Stack:** React 19, Next.js 16, TypeScript, React DOM portals, CSS, Vitest, Testing Library

---

### Task 1: Portalize and restyle the author preview modal

**Files:**
- Modify: `apps/web/src/components/social/AuthorPreview.test.tsx`
- Modify: `apps/web/src/components/social/AuthorPreview.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/globals.test.ts`

- [ ] **Step 1: Write failing modal behavior tests**

Add tests that open the dialog and assert:

```tsx
const {container} = render(<AuthorPreview author={author} canMutate={false} labels={labels} locale="en" returnTo="/en"/>)
const trigger = screen.getByRole('button', {name: 'Profile: Luma'})
fireEvent.click(trigger)
const dialog = screen.getByRole('dialog', {name: 'Luma'})
const backdrop = dialog.parentElement
expect(backdrop).toHaveAttribute('data-author-preview-backdrop')
expect(container).not.toContainElement(dialog)
expect(screen.queryByRole('button', {name: 'Close'})).toBeNull()
```

Add separate tests proving `mouseDown` on the dialog does not close it, `mouseDown` on the backdrop closes it and restores trigger focus, and `Escape` closes it and restores trigger focus. Retain the existing follow/viewer-scope tests.

- [ ] **Step 2: Write failing CSS hierarchy tests**

In `globals.test.ts`, require `.author-preview-backdrop` to use `position:fixed`, `inset:0`, a uniform dark scrim and `z-index:110`; require the dialog width cap of 380px and radius of 20px; require the avatar to be 64px square; require `.author-preview-actions` and `.author-preview-follow-action` to span the card width; and require follow/link buttons to have `min-height:44px` and `width:100%`. Require no `.author-preview-close` production selector.

- [ ] **Step 3: Run RED tests**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- src/components/social/AuthorPreview.test.tsx src/app/globals.test.ts
```

Expected: FAIL because the dialog is mounted inside the post, a close button exists, z-index is 60, the avatar is 52px, and the action is right-aligned/min-width only.

- [ ] **Step 4: Render the modal through a document portal**

Import `createPortal` from `react-dom`. Build the modal once when `open` is true and return it after the trigger via:

```tsx
{open && typeof document !== 'undefined' ? createPortal(modal, document.body) : null}
```

Give the overlay `data-author-preview-backdrop`. Remove the close button entirely. Keep backdrop dismissal guarded by `event.target === event.currentTarget`, preserve `Escape`, the focus trap, and `close()` focus restoration. Stop dialog `mouseDown` propagation explicitly so inner interactions never dismiss it.

- [ ] **Step 5: Match the supplied Threads layout**

Keep the identity block on the left and enlarge the linked avatar to 64px at the upper right. Remove obsolete close-button padding. Use a centered 380px maximum dialog with 20px radius and balanced 24px spacing. Stack biography, creator attribution, and follower count below identity. Make the action container and its nested profile-follow wrapper full width; make both signed-in and sign-in actions full width and at least 44px high. Use `z-index:110` for the fixed full-viewport scrim so it sits above AIFANS navigation (`30`), menus (`70`), and report overlay (`100`). Constrain width to `min(380px, calc(100vw - 32px))` so mobile never overflows.

- [ ] **Step 6: Run GREEN tests and verify types**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test -- src/components/social/AuthorPreview.test.tsx src/app/globals.test.ts
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web typecheck
git diff --check
```

Expected: all Web tests pass, typecheck passes, and diff check emits no output.

- [ ] **Step 7: Commit the modal implementation**

```bash
git add apps/web/src/components/social/AuthorPreview.test.tsx apps/web/src/components/social/AuthorPreview.tsx apps/web/src/app/globals.css apps/web/src/app/globals.test.ts
git commit -m "fix(web): match Threads author preview modal"
```

### Task 2: Integrate, review, and deploy

**Files:**
- No product files unless verification finds an evidenced regression

- [ ] **Step 1: Run the complete Web gate**

```bash
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web test
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web typecheck
PATH="/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/luorh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH" pnpm --dir apps/web build
git diff --check
```

Expected: 103 Web files / 822 tests or more pass, typecheck passes, production build and prerender verification pass, and diff check is clean.

- [ ] **Step 2: Review the feature diff**

Review from commit `49154d4` through HEAD for portal lifecycle, server-render safety, focus containment, trigger restoration, backdrop dismissal, stacking order, mobile overflow, and unchanged follow behavior. Fix only concrete findings and rerun their focused tests.

- [ ] **Step 3: Push the feature branch**

```bash
git push origin codex/ux-slice-0-1
```

Do not modify or push `main`.

- [ ] **Step 4: Accept the real Preview**

Wait for `Vercel – ai-parter-v1-web` success on the final SHA. In the signed-in Preview, open author dialogs from Home, Search post results, collections, profile posts, comments, and post detail. At 430px, 768px, 1024px, and 1440px in light and dark modes verify a uniform scrim with no navigation/avatar leaks, no close button, 64px avatar, full-width action, overlay/Escape dismissal, focus return, no horizontal overflow, and no application console errors. Leave the Home Preview open for user validation and report the final SHA and URL.
