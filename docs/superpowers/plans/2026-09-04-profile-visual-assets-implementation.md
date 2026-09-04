# Profile Visual Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable avatar and profile-background editing, move profile editing to a responsive standalone page, and synchronize the saved avatar across AIFANS surfaces.

**Architecture:** Extend the account contract and profile repository with an explicit background union and versioned profile updates. Reuse the public R2 signed-upload pattern through profile-owned upload reservations, then expose upload intent/confirmation through the existing `/v1/me` and Next proxy boundary. A shared current-account store and Avatar component become the only client-side source for the signed-in user's identity image.

**Tech Stack:** TypeScript, Zod, PostgreSQL migrations/RLS, Hono, AWS S3-compatible R2, Next.js 16 App Router, React 19, CSS Modules, Vitest, Testing Library.

---

## File map

- `packages/contracts/src/account.ts`: public account, background, upload-intent, confirmation, and versioned-update contracts.
- `packages/contracts/src/account.test.ts`: strict contract and invalid-state coverage.
- `packages/db/migrations/202609040003_profile_visual_assets.sql`: profile columns, upload reservations, checks, grants, RLS, and current-account projection.
- `packages/db/src/schema.ts`: Drizzle declarations for the migration.
- `packages/db/src/profiles.ts`: normalize visual fields, reserve/confirm uploads, and atomically update a versioned profile.
- `packages/db/tests/profiles.test.ts`: ownership, binding, version-conflict, and projection integration tests.
- `apps/api/src/ports/profile-assets.ts`: storage boundary for signed upload and HEAD verification.
- `apps/api/src/adapters/r2-profile-assets.ts`: public R2 implementation with profile-specific key validation.
- `apps/api/src/routes/me.ts`: upload-intent, confirmation, and version-conflict HTTP endpoints.
- `apps/api/src/routes/me.test.ts`: API authorization and validation coverage.
- `apps/api/src/application.ts`, `apps/api/src/production.ts`, `apps/api/src/index.ts`: dependency registration and production wiring.
- `apps/web/src/app/api/me/assets/route.ts`: same-origin upload-intent/confirmation proxy.
- `apps/web/src/components/account/Avatar.tsx`: shared image/fallback renderer.
- `apps/web/src/components/account/CurrentAccountProvider.tsx`: account cache and cross-tab invalidation.
- `apps/web/src/app/[locale]/profile/edit/page.tsx`: authenticated standalone edit route.
- `apps/web/src/components/profile/ProfileEditor.tsx`: upload, preview, background choice, focal-point controls, and save behavior.
- `apps/web/src/components/profile/ProfileEditor.module.css`: responsive standalone-page layout.
- `apps/web/src/components/profile/MyProfilePanel.tsx`: route-based edit action and saved background/avatar rendering.
- `apps/web/src/components/profile/MyProfilePanel.module.css`: profile hero and corrected vertical rhythm.
- `apps/web/src/i18n/messages/*.ts`: labels for assets, progress, errors, conflict, discard, and background presets.

### Task 1: Define strict account visual-asset contracts

**Files:**
- Modify: `packages/contracts/src/account.ts`
- Modify: `packages/contracts/src/account.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add cases that accept the color and image variants, require a version, and reject arbitrary colors or URLs:

```ts
expect(AccountSchema.parse({...account, profileVersion: 3, background: {type: 'color', colorKey: 'paper'}}).background)
  .toEqual({type: 'color', colorKey: 'paper'})
expect(UpdateCurrentAccountSchema.safeParse({profileVersion: 3, background: {type: 'color', colorKey: '#fff'}}).success).toBe(false)
expect(UpdateCurrentAccountSchema.safeParse({profileVersion: 3, avatarUrl: 'https://evil.example/a.png'}).success).toBe(false)
expect(ProfileAssetIntentRequestSchema.parse({role: 'avatar', contentType: 'image/webp', sizeBytes: 1200, width: 512, height: 512}).role).toBe('avatar')
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm vitest run packages/contracts/src/account.test.ts`

Expected: FAIL because the visual-asset schemas and version fields do not exist.

- [ ] **Step 3: Implement the contracts**

Define the shared shapes and include them in `AccountSchema` and `UpdateCurrentAccountSchema`:

```ts
export const ProfileBackgroundColorKeySchema = z.enum(['paper', 'sand', 'mist', 'sage', 'sky', 'lilac', 'graphite'])
export const ProfileBackgroundSchema = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('color'), colorKey: ProfileBackgroundColorKeySchema}),
  z.strictObject({type: z.literal('image'), url: z.url(), focalX: z.number().min(0).max(1), focalY: z.number().min(0).max(1)}),
])
export const ProfileAssetRoleSchema = z.enum(['avatar', 'background'])
export const ProfileAssetIntentRequestSchema = z.strictObject({
  role: ProfileAssetRoleSchema,
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().min(1).max(10_485_760),
  width: z.number().int().min(64).max(12_000),
  height: z.number().int().min(64).max(12_000),
})
export const ProfileAssetIntentSchema = z.strictObject({
  assetId: z.uuid(), method: z.literal('PUT'), url: z.url(),
  headers: z.record(z.string(), z.string()), expiresAt: z.iso.datetime(), maxBytes: z.number().int(),
})
```

Expose only `avatarAssetId`, `background`, and `profileVersion` as visual edit inputs; keep `avatarUrl` and image background URL output-only.

- [ ] **Step 4: Run contract tests**

Run: `pnpm vitest run packages/contracts/src/account.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/account.ts packages/contracts/src/account.test.ts
git commit -m "feat(contracts): define profile visual assets"
```

### Task 2: Add profile-owned assets and atomic persistence

**Files:**
- Create: `packages/db/migrations/202609040003_profile_visual_assets.sql`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/profiles.ts`
- Modify: `packages/db/tests/profiles.test.ts`

- [ ] **Step 1: Write failing repository integration tests**

Cover a human profile reserving an avatar, confirming it, binding it with the current `profileVersion`, receiving the public URL, rejecting another actor's asset ID, and rejecting a stale version.

```ts
const reservation = await repository.reserveProfileAsset({subject: first.authSubject}, {
  role: 'avatar', contentType: 'image/webp', sizeBytes: 1200, width: 512, height: 512,
})
await repository.confirmProfileAsset({subject: first.authSubject}, reservation.id)
const updated = await repository.updateCurrentAccount({subject: first.authSubject}, {
  profileVersion: first.profileVersion, avatarAssetId: reservation.id,
})
expect(updated?.avatarUrl).toMatch(/\/public\/profiles\//)
await expect(repository.updateCurrentAccount({subject: first.authSubject}, {
  profileVersion: first.profileVersion, displayName: 'Stale',
})).rejects.toMatchObject({code: 'PROFILE_VERSION_CONFLICT'})
```

- [ ] **Step 2: Run the database test and verify failure**

Run: `pnpm db:test -- --run packages/db/tests/profiles.test.ts`

Expected: FAIL because the migration and repository methods do not exist.

- [ ] **Step 3: Create the migration**

Add `profile_background_type`, `profile_asset_role`, and a `profile_asset_upload_reservations` table with owner FK, randomized object key, declared metadata, ten-minute expiry, `verified_at`, and `consumed_at`. Add profile background columns and `profile_version bigint NOT NULL DEFAULT 1`.

Use database checks equivalent to:

```sql
CHECK (background_focal_x BETWEEN 0 AND 1),
CHECK (background_focal_y BETWEEN 0 AND 1),
CHECK ((background_type = 'color' AND background_object_key IS NULL)
    OR (background_type = 'image' AND background_object_key IS NOT NULL)),
CHECK (background_color_key IN ('paper','sand','mist','sage','sky','lilac','graphite'))
```

Restrict raw reservation table access, add an owner RLS policy, update `public.current_account()` to project visual fields/version, and grant only the required profile columns to `aifans_authenticated`.

- [ ] **Step 4: Implement repository reservation, confirmation, and update**

Generate keys only on the server:

```ts
const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[input.contentType]
const assetId = randomUUID()
const objectKey = `public/profiles/${profileId}/${input.role}/${assetId}.${extension}`
```

In `updateCurrentAccount`, lock the current profile, compare `profile_version`, verify every supplied asset is owned, verified, unexpired and unconsumed, update the profile, mark the selected reservation consumed, and return the normalized current account within the same actor transaction.

- [ ] **Step 5: Run migration and repository tests**

Run: `pnpm db:test -- --run packages/db/tests/profiles.test.ts`

Expected: PASS with ownership and stale-write cases covered.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/202609040003_profile_visual_assets.sql packages/db/src/schema.ts packages/db/src/profiles.ts packages/db/tests/profiles.test.ts
git commit -m "feat(db): persist profile visual assets"
```

### Task 3: Expose signed profile uploads through the API

**Files:**
- Create: `apps/api/src/ports/profile-assets.ts`
- Create: `apps/api/src/adapters/r2-profile-assets.ts`
- Create: `apps/api/src/adapters/r2-profile-assets.test.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/routes/me.test.ts`
- Modify: `apps/api/src/application.ts`
- Modify: `apps/api/src/production.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing adapter and route tests**

Assert that upload intents use only `public/profiles/<profile>/<role>/<uuid>.<ext>`, bind content type/length, expire within ten minutes, and that confirmation rejects missing or mismatched objects. Assert authentication happens before parsing and an actor cannot confirm another actor's reservation.

- [ ] **Step 2: Run the focused API tests and verify failure**

Run: `pnpm vitest run apps/api/src/adapters/r2-profile-assets.test.ts apps/api/src/routes/me.test.ts`

Expected: FAIL because the new port and routes do not exist.

- [ ] **Step 3: Implement the storage adapter**

Use the same S3 client, signing duration and HEAD verification pattern as `r2-post-media.ts`, with a profile-key schema:

```ts
const profileKey = z.string().regex(/^public\/profiles\/[0-9a-f-]+\/(?:avatar|background)\/[0-9a-f-]+\.(?:jpg|png|webp)$/)
```

The port exposes `createUploadIntent()` and `inspectUpload()` and never returns an object key to the browser.

- [ ] **Step 4: Register API endpoints**

Add:

```text
POST /v1/me/assets/upload-intent
POST /v1/me/assets/:assetId/confirm
```

The intent endpoint authenticates, provisions the human profile, creates the DB reservation, then asks the storage port for a signed PUT. Confirmation loads the actor-owned reservation, HEAD-verifies exact content type/length, and marks it verified. Map missing storage to `PROFILE_ASSETS_NOT_CONFIGURED`, invalid upload to 422, stale update to 409, and unauthorized ownership to 404.

- [ ] **Step 5: Wire production dependencies and run tests**

Run: `pnpm vitest run apps/api/src/adapters/r2-profile-assets.test.ts apps/api/src/routes/me.test.ts apps/api/src/production.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ports/profile-assets.ts apps/api/src/adapters/r2-profile-assets.ts apps/api/src/adapters/r2-profile-assets.test.ts apps/api/src/routes/me.ts apps/api/src/routes/me.test.ts apps/api/src/application.ts apps/api/src/production.ts apps/api/src/index.ts
git commit -m "feat(api): add profile asset uploads"
```

### Task 4: Add the web proxy and shared account identity state

**Files:**
- Create: `apps/web/src/app/api/me/assets/route.ts`
- Create: `apps/web/src/app/api/me/assets/route.test.ts`
- Create: `apps/web/src/components/account/Avatar.tsx`
- Create: `apps/web/src/components/account/Avatar.test.tsx`
- Create: `apps/web/src/components/account/CurrentAccountProvider.tsx`
- Create: `apps/web/src/components/account/CurrentAccountProvider.test.tsx`
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: `apps/web/src/components/social/CommentComposer.tsx`

- [ ] **Step 1: Write failing proxy, Avatar, and synchronization tests**

Test same-origin enforcement and body limits in the proxy. Test image/error fallback in Avatar. Mount two provider consumers, dispatch an `aifans:account-updated` broadcast event, and assert both re-fetch and render the new avatar.

- [ ] **Step 2: Run focused web tests and verify failure**

Run: `pnpm vitest run --project web apps/web/src/app/api/me/assets/route.test.ts apps/web/src/components/account/Avatar.test.tsx apps/web/src/components/account/CurrentAccountProvider.test.tsx`

Expected: FAIL because the proxy and components do not exist.

- [ ] **Step 3: Implement the strict proxy**

Forward only the two supported POST shapes to `/v1/me/assets/upload-intent` and `/v1/me/assets/:assetId/confirm`, reuse the `/api/me` same-origin/body-limit behavior, preserve request ID, and always return `cache-control: no-store`.

- [ ] **Step 4: Implement the shared Avatar and account provider**

Avatar accepts `{displayName, avatarUrl, size, className}` and renders an image until `onError`, then a Unicode-safe first initial. The provider owns `/api/me`, updates state atomically after save, uses a named `BroadcastChannel('aifans-account')`, and falls back to a same-window custom event.

```ts
const ACCOUNT_UPDATED_EVENT = 'aifans:account-updated'
export function publishAccountUpdate(account: Account) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT, {detail: account}))
  new BroadcastChannel('aifans-account').postMessage({type: 'updated'})
}
```

Reuse Avatar in `CommentComposer` first; later migrations must import the same component rather than reproducing fallback logic.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run --project web apps/web/src/app/api/me/assets/route.test.ts apps/web/src/components/account/Avatar.test.tsx apps/web/src/components/account/CurrentAccountProvider.test.tsx apps/web/src/components/social/CommentComposer.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/me/assets apps/web/src/components/account apps/web/src/app/'[locale]'/layout.tsx apps/web/src/components/social/CommentComposer.tsx apps/web/src/components/social/CommentComposer.test.tsx
git commit -m "feat(web): share current account identity"
```

### Task 5: Build the standalone responsive profile editor

**Files:**
- Create: `apps/web/src/app/[locale]/profile/edit/page.tsx`
- Create: `apps/web/src/app/[locale]/profile/edit/page.test.tsx`
- Create: `apps/web/src/components/profile/ProfileEditor.tsx`
- Create: `apps/web/src/components/profile/ProfileEditor.module.css`
- Create: `apps/web/src/components/profile/ProfileEditor.test.tsx`
- Modify: `apps/web/src/i18n/messages/en.ts`
- Modify: `apps/web/src/i18n/messages/zh-CN.ts`

- [ ] **Step 1: Write failing route and interaction tests**

Cover authenticated routing, edit-link return path, local image preview, intent → PUT → confirm order, color/image mutual exclusion, focal point clamping, save-only activation, cancellation, save failure retention, stale-version messaging, and unsaved navigation confirmation.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm vitest run --project web apps/web/src/app/'[locale]'/profile/edit/page.test.tsx apps/web/src/components/profile/ProfileEditor.test.tsx`

Expected: FAIL because the route and editor do not exist.

- [ ] **Step 3: Implement the authenticated route and standard header**

Require authentication with return target `/${locale}/profile/edit`. Render a standard page header with back target from a validated local `returnTo` query, title, and a submit button associated with the form through `form="profile-editor"`.

- [ ] **Step 4: Implement upload and preview behavior**

Read intrinsic dimensions before requesting an intent. Upload with the exact signed headers, confirm, and hold the returned asset ID only in draft state. Use `URL.createObjectURL()` for preview and always revoke it on replacement/unmount. Clamp focal coordinates:

```ts
const clampFocal = (value: number) => Math.min(1, Math.max(0, value))
```

Render the seven background color tokens from one shared map. Save one versioned `/api/me` patch and call `publishAccountUpdate(nextAccount)` only after a successful response.

- [ ] **Step 5: Implement responsive and accessible styling**

Use one page structure at every breakpoint, a readable desktop max-width, 16/24px section rhythm, 44px controls, visible labels/focus, reserved media aspect ratios, `object-fit: cover`, and CSS custom properties for focal position. Do not add modal/backdrop CSS.

- [ ] **Step 6: Run editor tests**

Run: `pnpm vitest run --project web apps/web/src/app/'[locale]'/profile/edit/page.test.tsx apps/web/src/components/profile/ProfileEditor.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/'[locale]'/profile/edit apps/web/src/components/profile/ProfileEditor.tsx apps/web/src/components/profile/ProfileEditor.module.css apps/web/src/components/profile/ProfileEditor.test.tsx apps/web/src/i18n/messages/en.ts apps/web/src/i18n/messages/zh-CN.ts
git commit -m "feat(web): add standalone profile editor"
```

### Task 6: Render saved visuals and correct profile spacing

**Files:**
- Modify: `apps/web/src/components/profile/MyProfilePanel.tsx`
- Modify: `apps/web/src/components/profile/MyProfilePanel.module.css`
- Modify: `apps/web/src/components/profile/MyProfilePanel.test.tsx`
- Modify: `apps/web/src/components/social/PostDetailContent.tsx`
- Modify: `apps/web/src/components/social/SocialContent.test.tsx`

- [ ] **Step 1: Replace modal expectations with page and visual tests**

Assert the edit control links to `/${locale}/profile/edit?returnTo=...`, the saved background uses the declared token or URL/focal point, and Avatar renders the saved image. Remove modal focus-trap/backdrop tests because the modal no longer exists.

- [ ] **Step 2: Add a CSS regression assertion for vertical rhythm**

Assert `.profile` does not reserve extra bottom space and the gap from `.editAction` to the tab list resolves to 16px on phone and 24px from 700px upward.

- [ ] **Step 3: Implement the profile hero and route link**

Render background before identity content, use shared Avatar, convert Edit to `Link`, and remove all editing state, overlay, focus-trap and inline PATCH code from `MyProfilePanel`.

- [ ] **Step 4: Use shared account state in the detail composer**

Replace duplicate `/api/me` client resolution with the provider hook while keeping the authenticated server account as the first render seed. This guarantees the open detail page switches avatar after a profile update event.

- [ ] **Step 5: Run profile and social tests**

Run: `pnpm vitest run --project web apps/web/src/components/profile/MyProfilePanel.test.tsx apps/web/src/components/social/SocialContent.test.tsx apps/web/src/app/'[locale]'/profile/page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/profile/MyProfilePanel.tsx apps/web/src/components/profile/MyProfilePanel.module.css apps/web/src/components/profile/MyProfilePanel.test.tsx apps/web/src/components/social/PostDetailContent.tsx apps/web/src/components/social/SocialContent.test.tsx
git commit -m "feat(web): render profile visual identity"
```

### Task 7: Verify the integrated feature and deployment contract

**Files:**
- Verify: all files listed in Tasks 1–6; corrections remain scoped to the failing owner file and its focused test

- [ ] **Step 1: Run focused unit and integration tests**

Run:

```bash
pnpm vitest run packages/contracts/src/account.test.ts apps/api/src/routes/me.test.ts apps/api/src/adapters/r2-profile-assets.test.ts
pnpm vitest run --project web apps/web/src/components/account apps/web/src/components/profile apps/web/src/app/api/me apps/web/src/app/'[locale]'/profile
pnpm db:test -- --run packages/db/tests/profiles.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run repository quality gates**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Perform responsive browser verification**

Verify at 375px, 768px, 1024px and 1440px: edit is a page rather than a dialog; upload controls are reachable; background focal subject remains visible; profile tabs sit 16/24px below the edit action; final content is not hidden by fixed navigation.

- [ ] **Step 4: Perform identity synchronization verification**

Open two same-origin windows with the same account. Save a new avatar in one and verify the other refreshes the avatar on profile, post detail, comment composer, messages and notifications without sign-out. Open a second browser profile with another account and verify sessions and avatars remain independent.

- [ ] **Step 5: Verify deployment prerequisites and migrate preview**

Confirm preview API has the existing `R2_PUBLIC_*` variables and public CORS allows signed PUT from the preview web origin. Apply `202609040003_profile_visual_assets.sql` to the preview database before promoting the API and web commits.

- [ ] **Step 6: Record final evidence**

Capture the deployed commit SHA, migration result, API health, upload-intent/confirm status, `/api/me` visual response, and responsive screenshots in the task handoff before telling the user the feature is ready to verify.
