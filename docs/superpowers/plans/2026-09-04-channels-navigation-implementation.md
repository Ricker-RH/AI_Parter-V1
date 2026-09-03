# Channels and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add durable channel discovery, channel IP/content aggregation, responsive navigation, and a route-scoped floating creator entry without changing the current creator workflow.

**Architecture:** Add normalized channel and channel-to-IP tables, expose public channel reads plus operator-managed writes through the existing DB repository and Hono API layers, and consume those contracts from new Next.js channel routes. Keep navigation and floating-action visibility in shared shell route metadata so every viewport uses one rule set.

**Tech Stack:** PostgreSQL/Drizzle, Zod contracts, Hono API, Next.js App Router, React, CSS modules/global shell CSS, Vitest, existing Vercel Preview deployment.

---

## File map

- Contracts: packages/contracts/src/channels.ts, packages/contracts/src/channels.test.ts, packages/contracts/src/index.ts
- Database schema/migration: packages/db/src/schema.ts, packages/db/migrations/202609040001_channels.sql
- Database repository: packages/db/src/channels.ts, packages/db/src/index.ts, packages/db/src/runtime.ts, packages/db/tests/channels.test.ts
- API ports/routes: apps/api/src/ports/channels.ts, apps/api/src/ports/channels.database.ts, apps/api/src/routes/channels.ts, apps/api/src/routes/channels.test.ts
- API wiring: apps/api/src/application.ts, apps/api/src/production.ts, apps/api/src/production.test.ts
- Admin API: apps/api/src/routes/admin-channels.ts, apps/api/src/routes/admin-channels.test.ts
- Web data access: apps/web/src/lib/channels-api.ts, apps/web/src/lib/channels-api.test.ts
- Web channel UI: apps/web/src/components/channels/ChannelDirectory.tsx, ChannelIpRail.tsx, ChannelIpList.tsx, ChannelPage.module.css and tests beside them
- Web routes: apps/web/src/app/[locale]/channels/page.tsx, apps/web/src/app/[locale]/channels/[slug]/page.tsx, apps/web/src/app/[locale]/channels/[slug]/profiles/page.tsx and loading/test files
- Navigation: apps/web/src/components/AppNav.tsx, MobileNav.tsx, MobileNav.test.tsx, PathAwareShell.tsx, shell/route-shell.ts, shell/route-shell.test.ts
- Floating action: apps/web/src/components/FloatingCreatorAction.tsx, FloatingCreatorAction.test.tsx, shell/PublicShell.tsx, shell/MessagesShell.tsx
- Styling/i18n/analytics: apps/web/src/app/globals.css, apps/web/src/app/[locale]/layout.tsx, apps/web/src/app/page-messages.ts, apps/web/src/lib/analytics/contracts.ts, apps/web/src/lib/analytics/provider.tsx
- Admin Web: apps/web/src/components/admin/AdminChannels.tsx, AdminChannels.test.tsx, apps/web/src/app/[locale]/admin/channels/page.tsx

### Task 1: Shared channel contracts

- [ ] Write failing contract tests for valid/invalid slugs, bounded limits, cursors, directory items, IP items, feed pages, and admin payloads in packages/contracts/src/channels.test.ts.
- [ ] Run pnpm -C packages/contracts test and verify the new tests fail because channels.ts is absent.
- [ ] Create packages/contracts/src/channels.ts with these public shapes:

~~~ts
export const ChannelSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80)
export const ChannelQuerySchema = z.strictObject({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).optional(),
})
export const ChannelSummarySchema = z.strictObject({
  id: z.uuid(), slug: ChannelSlugSchema, name: z.string().min(1).max(80),
  description: z.string().max(280), imageUrl: z.url().nullable(), ipCount: z.number().int().nonnegative(),
})
export const ChannelPageSchema = z.strictObject({
  items: z.array(ChannelSummarySchema), nextCursor: z.string().nullable(),
})
export const ChannelDetailSchema = ChannelSummarySchema.extend({
  recommendedIps: z.array(PublicIpSchema),
})
export const ChannelIpPageSchema = z.strictObject({
  items: z.array(PublicIpSchema), nextCursor: z.string().nullable(),
})
export const ChannelPostPageSchema = FeedPageSchema
~~~

- [ ] Add explicit opaque cursor encode/decode helpers with version, sort key, timestamp/weight, and UUID tie-breaker; reject malformed, oversized, duplicate-field, and non-canonical cursors.
- [ ] Export channel schemas and types from packages/contracts/src/index.ts.
- [ ] Run pnpm -C packages/contracts test and pnpm -C packages/contracts typecheck; expect both to pass.
- [ ] Commit only contract files with message feat(contracts): add channel resources.

### Task 2: Normalized database model and repositories

- [ ] Write failing integration tests in packages/db/tests/channels.test.ts for multi-channel membership, one primary channel per IP, published-only reads, search, recommendation ordering, newest-first channel posts, stable cursor pagination, archive behavior, and operator-only writes.
- [ ] Run the focused DB test against the local test database and verify failure before the migration exists.
- [ ] Add Drizzle tables to packages/db/src/schema.ts:

~~~ts
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  imageObjectKey: text('image_object_key'),
  searchDocument: text('search_document').notNull(),
  status: channelStatusEnum('status').notNull().default('draft'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
})
export const channelIpProfiles = pgTable('channel_ip_profiles', {
  channelId: uuid('channel_id').notNull().references(() => channels.id, {onDelete: 'cascade'}),
  ipProfileId: uuid('ip_profile_id').notNull().references(() => ipProfiles.profileId, {onDelete: 'cascade'}),
  isPrimary: boolean('is_primary').notNull().default(false),
  curationWeight: integer('curation_weight').notNull().default(0),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, table => [primaryKey({columns: [table.channelId, table.ipProfileId]})])
~~~

- [ ] Create packages/db/migrations/202609040001_channels.sql with channel_status enum, channels, channel_search_aliases, channel_ip_profiles, foreign keys, checks, unique primary-channel partial index, sort/pagination indexes, pg_trgm extension and GIN search indexes, grants and RLS matching existing public/operator roles.
- [ ] Create packages/db/src/channels.ts with ChannelRepository public reads and PlatformChannelRepository transactional writes. Public list methods must use bounded SQL, tuple cursors, published filters and deterministic tie-breakers.
- [ ] Implement recommendation order as curation_weight DESC, ip_profiles.feed_weight DESC, latest published post time DESC NULLS LAST, profile_id DESC.
- [ ] Implement channel post order as posts.published_at DESC, posts.id DESC through a direct channel_ip_profiles join.
- [ ] Export tables/repositories from packages/db/src/index.ts and wire public/platform repositories in packages/db/src/runtime.ts.
- [ ] Run pnpm db:migrate, the focused DB test, pnpm -C packages/db test and pnpm -C packages/db typecheck; expect all to pass.
- [ ] Commit DB files with message feat(db): add channel catalog and membership.

### Task 3: Public and operator channel API

- [ ] Write failing API tests for GET /v1/channels, /v1/channels/:slug, /profiles and /posts, including duplicate query keys, invalid cursors, unavailable storage, archived channels, and response-schema validation.
- [ ] Write failing operator route tests for create/update/publish/archive, alias replacement, membership assignment, primary membership and weight changes.
- [ ] Run pnpm -C apps/api test -- routes/channels.test.ts routes/admin-channels.test.ts and verify failure before routes are registered.
- [ ] Define apps/api/src/ports/channels.ts with public read and platform mutation interfaces matching Task 1 contracts, then create the DB adapters in channels.database.ts.
- [ ] Register public routes in apps/api/src/routes/channels.ts. Use safe query parsing, explicit 400 INVALID_REQUEST / INVALID_CURSOR, 404 CHANNEL_NOT_FOUND and 503 CHANNELS_NOT_CONFIGURED responses.
- [ ] Register operator routes in apps/api/src/routes/admin-channels.ts through the existing authority check and request context/audit pattern.
- [ ] Add channels and platformChannels dependencies to apps/api/src/application.ts, production.ts and production tests.
- [ ] Run pnpm -C apps/api test and pnpm -C apps/api typecheck; expect both to pass.
- [ ] Commit API files with message feat(api): expose channel catalog.

### Task 4: Shared navigation and floating creator action

- [ ] Update navigation tests first: desktop contains Channels, Liked and Bookmarks; mobile items are Home, Channels, Messages and My Profile in that exact order.
- [ ] Add route-policy tests that return true only for /[locale], /[locale]/channels and /[locale]/messages, and false for query-equivalent details, post details, channel details, profile lists, conversations, profile, activity and creator routes.
- [ ] Create a ChannelsIcon in the existing UI icon style and add channels to ShellLabels/NavItem types and locale messages.
- [ ] Change mobileNavItems to exactly forYou, channels, messages, profile. Keep desktop liked/bookmarks and insert channels in the approved position.
- [ ] Create FloatingCreatorAction.tsx:

~~~tsx
export function FloatingCreatorAction({locale, pathname, label}: Props) {
  if (!showsFloatingCreatorAction(pathname)) return null
  return <Link aria-label={label} className="floating-creator-action" href={"/" + locale + "/creator"}><CreatorPlusIcon aria-hidden="true"/></Link>
}
~~~

- [ ] Render the shared action from PublicShell and MessagesShell, not from route pages. Add safe-area-aware fixed positioning, 52px visual size, at least 44px target and content bottom clearance in globals.css.
- [ ] Update the mobile navigation grid from five to four columns and verify fixed positioning does not move with document scroll.
- [ ] Run focused AppNav/MobileNav/route-shell/FloatingCreatorAction tests and pnpm -C apps/web typecheck.
- [ ] Commit navigation files with message feat(web): add channel navigation and floating creator action.

### Task 5: Channel Web data layer and responsive pages

- [ ] Write failing channels-api tests for query encoding, bounded input, server token behavior and response validation.
- [ ] Create channels-api.ts using the existing server API wrapper and channel contract schemas.
- [ ] Write component tests for directory search debounce, no-result clearing, channel links, recommended IP order, View All route, direct post rendering, absence of a Latest Content heading, empty/error/retry states and accessible 44px interactions.
- [ ] Create ChannelDirectory, ChannelIpRail and ChannelIpList as focused components. Reuse existing PostCard, ProfileResult, ResultState and retry primitives rather than copy them.
- [ ] Add page routes and loading states:
  - /[locale]/channels
  - /[locale]/channels/[slug]
  - /[locale]/channels/[slug]/profiles
- [ ] Implement search with a 300ms client debounce and URL q synchronization; the server remains authoritative and no full directory is preloaded.
- [ ] Implement CSS breakpoints: mobile one column and horizontal IP rail; medium/large two-column directory; detail and IP list retain a capped readable single column; all pages include safe bottom padding.
- [ ] Extend analytics route names for channel directory/detail without sending search text or sensitive identifiers.
- [ ] Run focused Web tests, pnpm -C apps/web typecheck and pnpm -C apps/web build.
- [ ] Commit Web channel files with message feat(web): add responsive channel discovery.

### Task 6: Admin channel management

- [ ] Write failing AdminChannels tests for create/edit, publish/archive, alias editing, IP assignment, primary-channel selection and curation weight.
- [ ] Create the /[locale]/admin/channels page and AdminChannels component using the existing admin shell, form controls, API proxy and inline error/retry patterns.
- [ ] Prevent non-operators from seeing or invoking channel mutations through both API authorization and Web page access policy.
- [ ] Add an Admin navigation entry for Channels without altering creator review behavior.
- [ ] Run focused admin tests, full apps/web typecheck and build.
- [ ] Commit admin Web files with message feat(admin): manage channels.

### Task 7: Integration, seed and regression

- [ ] Add a deterministic Preview-only seed/admin script that creates a small channel set and assigns existing published IPs without embedding records in the Web bundle; make reruns idempotent by slug and membership key.
- [ ] Run the seed against local DB twice and verify identical row counts and memberships.
- [ ] Run pnpm test, pnpm typecheck, pnpm build and pnpm db:test; all must pass.
- [ ] Run git diff --check and inspect git status; do not add existing .DS_Store or .superpowers files.
- [ ] Perform independent review for schema constraints, public/operator authorization, cursor correctness, route-level FAB visibility, responsiveness, duplication and regression risk.
- [ ] Fix only evidenced issues, rerun affected focused tests, then rerun the full validation suite.
- [ ] Commit integration fixes with message test(channels): cover channel feature integration.

### Task 8: Preview migration, deployment and online acceptance

- [ ] Push codex/ux-slice-0-1 only after the complete local suite passes.
- [ ] Apply the additive migration to the Preview database and run the idempotent Preview seed; do not touch production data.
- [ ] Confirm API Preview is Ready, health is 200, and channel directory/detail/profile/post endpoints return schema-valid responses.
- [ ] Confirm Web Preview is Ready for the same commit SHA.
- [ ] Verify desktop, medium and mobile channel directory/detail/IP-list layouts; validate search, pagination, links, empty/error states, four-item mobile nav, fixed bottom nav, safe-area clearance and floating-action visibility matrix.
- [ ] Verify the floating action opens the unchanged creator page from Home, Channel Directory and Message List only.
- [ ] Report the exact commit SHA and stable Preview URL for user acceptance.
