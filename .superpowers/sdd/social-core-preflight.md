# Social-core vertical-slice preflight

**Status: ready to plan, blocked from implementation only by the two platform prerequisites below.** This is a read-only design pass; no product records or mock content are introduced.

## Existing seams to reuse

- Keep `public.profiles` as the one account table: a human is `account_kind = 'human'` with an auth subject; an IP is `account_kind = 'ip'` with no auth subject. Reuse `app.current_auth_subject()`, `public.current_account()`, `withActor`, and the `aifans_anon`/`aifans_authenticated` roles from `packages/db/migrations/202608310001_foundation.sql` and `packages/db/src/session.ts`.
- Add feature ports beside `apps/api/src/ports/profiles.ts`; handlers stay dependency-composed as in `apps/api/src/routes/me.ts`, and database composition stays server-only. The Web shell (`apps/web/`, currently untracked) must receive typed API data and preserve its empty states until real records exist.
- Reuse the current forward-only migration runner and Drizzle schema surface: add one reviewed SQL migration plus matching `packages/db/src/schema.ts` exports. Do not use the owner/admin pool for ordinary reader actions.

## Required prerequisite migration (history + platform authority)

Land this before social mutations; it is mandated by `docs/superpowers/specs/2026-09-01-aifans-history-analytics-design.md`.

- `public.profile_roles(profile_id uuid references profiles(id), role app_role not null, granted_by_profile_id uuid references profiles(id), granted_at timestamptz not null default now(), revoked_at timestamptz, primary key(profile_id, role))`; `app_role = enum ('operator')`. Only active rows (`revoked_at is null`) authorize the admin/API platform path. Bootstrap the first operator by an audited secure provisioning command, not a seed migration.
- `public.audit_events(id uuid primary key, occurred_at timestamptz not null default clock_timestamp(), actor_type audit_actor_type not null, actor_profile_id uuid null references profiles(id), action text not null, entity_type text not null, entity_id uuid not null, request_id uuid null, source_app audit_source not null, result audit_result not null, change_summary jsonb not null default '{}'::jsonb)`; enums: `audit_actor_type ('human','operator','system')`, `audit_source ('api','admin','worker')`, `audit_result ('succeeded','rejected','failed')`. Add indexes `(entity_type, entity_id, occurred_at desc)`, `(actor_profile_id, occurred_at desc)`, and `(request_id)` where not null.
- `public.business_events(id uuid primary key, event_name text not null, schema_version smallint not null check (schema_version > 0), occurred_at timestamptz not null default clock_timestamp(), actor_profile_id uuid null references profiles(id), subject_entity_type text not null, subject_entity_id uuid not null, request_id uuid null, environment text not null, properties jsonb not null default '{}'::jsonb)`, index `(event_name, occurred_at desc)` and `(actor_profile_id, occurred_at desc)`. Use allow-listed properties only; no post/comment body or credentials.
- `public.workflow_transitions(id uuid primary key, entity_type text not null, entity_id uuid not null, previous_state text null, next_state text not null, actor_profile_id uuid null references profiles(id), reason_code text null, operator_note text null, request_id uuid null, occurred_at timestamptz not null default clock_timestamp())`, index `(entity_type, entity_id, occurred_at desc)`. It records post publication/withdrawal transitions atomically with state changes.

All three history tables: RLS enabled; revoke all table privileges and all `PUBLIC` function privileges; grant **nothing** to `aifans_anon` or `aifans_authenticated`. Platform repositories write them in the same transaction as the state change. Application roles cannot update/delete them. `audit_events` and `business_events` are append-only/indefinitely retained; revision rows below are immutable.

## Exact social schema proposal

Use UUID primary keys generated in application services, `timestamptz`, and the same length/check style as `profiles`.

1. **IP public operation profile**
   - `ip_profiles(profile_id uuid primary key references profiles(id), source ip_source not null, creator_profile_id uuid null references profiles(id), public_state ip_public_state not null default 'draft', operation_enabled boolean not null default false, identity_label text not null default 'AI', current_identity_revision_id uuid null, feed_weight integer not null default 0 check (feed_weight between -1000 and 1000), created_at timestamptz not null default now(), updated_at timestamptz not null default now())`.
   - Enums: `ip_source ('platform','creator')`; `ip_public_state ('draft','approved','published','paused','unpublished')`. Check `creator_profile_id is null or source = 'creator'`; trigger verifies referenced `profiles.account_kind = 'ip'` and creator, when present, is human. Index `(public_state, operation_enabled)` and `(creator_profile_id)`.
   - `ip_identity_revisions(id uuid primary key, ip_profile_id uuid not null references ip_profiles(profile_id), version integer not null, display_name text not null, bio text null, avatar_object_key text null, cover_object_key text null, languages text[] not null default '{}', created_by_profile_id uuid null references profiles(id), previous_revision_id uuid null references ip_identity_revisions(id), created_at timestamptz not null default now(), unique(ip_profile_id, version))`; prohibit updates/deletes with a trigger. `ip_profiles.current_identity_revision_id` points to the approved revision. This supports the required immutable IP-card history without prematurely adding creator-generation tables.

2. **Published content**
   - Enums: `post_state ('draft','published','withdrawn')`, `post_source ('admin','worker')`, `media_kind ('image')`.
   - `posts(id uuid primary key, author_profile_id uuid not null references profiles(id), acting_operator_profile_id uuid null references profiles(id), state post_state not null default 'draft', source post_source not null, body text not null default '' check (char_length(body) <= 5000), language_code text null check (language_code is null or language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'), published_at timestamptz null, withdrawn_at timestamptz null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check ((state = 'draft' and published_at is null and withdrawn_at is null) or (state = 'published' and published_at is not null and withdrawn_at is null) or (state = 'withdrawn' and published_at is not null and withdrawn_at is not null)))`.
   - A deferrable trigger rejects any author that is not an IP; published/withdrawn rows must have an operator for `source = 'admin'`. `posts` are immutable after publish except the audited transition to withdrawn; no content edit is included in this slice. Index `(published_at desc, id desc) where state = 'published'`; `(author_profile_id, published_at desc, id desc) where state = 'published'`.
   - `post_media(id uuid primary key, post_id uuid not null references posts(id) on delete restrict, position smallint not null check (position between 1 and 4), object_key text not null check (char_length(object_key) <= 512), alt_text text null check (char_length(alt_text) <= 1000), content_type text not null check (content_type like 'image/%'), width integer null check (width > 0), height integer null check (height > 0), created_at timestamptz not null default now(), unique(post_id, position))`. A deferred constraint trigger enforces at least one image before `draft -> published`; R2 object verification belongs in the platform command.

3. **Relationships and comments**
   - `follows(follower_profile_id uuid references profiles(id), followed_profile_id uuid references profiles(id), created_at timestamptz not null default now(), primary key(follower_profile_id, followed_profile_id), check(follower_profile_id <> followed_profile_id))`, indexes `(followed_profile_id, created_at desc)` and `(follower_profile_id, created_at desc)`.
   - `post_likes(post_id uuid references posts(id), profile_id uuid references profiles(id), created_at timestamptz not null default now(), primary key(post_id, profile_id))`, index `(profile_id, created_at desc)`.
   - `bookmarks(post_id uuid references posts(id), profile_id uuid references profiles(id), created_at timestamptz not null default now(), primary key(post_id, profile_id))`, index `(profile_id, created_at desc)`; private by policy and no public count/read.
   - Enum `comment_source ('human','admin','worker')`. `comments(id uuid primary key, post_id uuid not null references posts(id), parent_comment_id uuid null references comments(id), author_profile_id uuid not null references profiles(id), acting_operator_profile_id uuid null references profiles(id), source comment_source not null, body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'), state comment_state not null default 'published', created_at timestamptz not null default now(), deleted_at timestamptz null, check ((source = 'human' and acting_operator_profile_id is null) or (source in ('admin','worker') and acting_operator_profile_id is not null)))`; `comment_state ('published','deleted')`. Trigger ensures parent belongs to same post and has depth at most 1 (post comment + one reply), human source author is human, and admin/worker source author is IP. Index `(post_id, created_at, id) where state = 'published'`, `(parent_comment_id, created_at, id) where state = 'published'`, `(author_profile_id, created_at desc)`.

4. **Core notifications**
   - Enum `notification_kind ('follow','post_like','comment','reply','comment_like')`.
   - `notifications(id uuid primary key, recipient_profile_id uuid not null references profiles(id), actor_profile_id uuid null references profiles(id), kind notification_kind not null, post_id uuid null references posts(id), comment_id uuid null references comments(id), created_at timestamptz not null default now(), read_at timestamptz null)`. Check references appropriate to kind in application command plus an SQL constraint trigger. Index `(recipient_profile_id, created_at desc, id desc)` and partial unread `(recipient_profile_id, created_at desc) where read_at is null`; optional partial unique `(recipient_profile_id, actor_profile_id, kind, post_id) where kind = 'post_like'` prevents duplicate notifications on idempotent like creation.

No denormalized counters in this vertical slice: calculate aggregates from actual rows for correctness. Add counter tables only after measured feed needs, with reconciliation jobs and audit coverage.

## RLS and command boundaries

Public reads (`aifans_anon`, `aifans_authenticated`): safe profile columns; IP profiles only where `public_state = 'published'`; identity revision only when it is the IP's current revision; posts/media only `state = 'published'`; comments only `state = 'published'`; follows only if a public profile projection is needed. Never expose `auth_subject`, object keys, operator IDs, unpublished state, history, or bookmarks.

Authenticated user writes under `withActor`:

- `follows`, `post_likes`, `bookmarks`: `INSERT` and `DELETE` only when `profile_id/follower_profile_id = app.current_auth_subject()`'s profile. `follows` permits any public profile target; UI may emphasize IPs, while the approved scope explicitly permits human creators. Likes/bookmarks require a published post.
- `comments`: `INSERT` only when author resolves to current human profile, `source = 'human'`, and post is published; no direct IP comment, operator ID, or foreign author input. Optional own soft-delete policy only; no hard delete. Notifications have no user `INSERT` or `DELETE` grant; `UPDATE(read_at)` only for recipient and only from null to non-null.
- User roles have no `INSERT`, `UPDATE`, or `DELETE` grant on `ip_profiles`, IP revisions, posts, post media, audit/business/workflow tables. This is the database backstop for “human cannot post top-level content.”

Platform writes: only a server-side `PlatformSocialRepository` invoked after verified operator membership from the privileged path. Its `publishPost` and `publishIpComment` commands accept the actor/operator context separately from the represented IP; both write content, transition/audit record, and business event in a single transaction. No endpoint accepts an `acting_operator_profile_id` from a browser body. Admin SQL uses a role/credential that has no browser exposure; the migration owner is reserved for migrations/provisioning, per the architecture decision.

## Smallest testable delivery sequence

1. Add shared event contracts, role bootstrap command, append-only history tables, and platform transaction helper. Test no anon/authenticated read/write; test one privileged mutation rolls back content plus history together.
2. Add IP profile/revision schema and safe public read projection. Test IP-only invariant, published-state visibility, immutable revisions, creator attribution, and empty query results without fixtures.
3. Add post/media schema and one admin-only command/route. Test a human cannot create a post by API or SQL; an active operator can publish an IP image/text post; post, media, transition, audit, and `post_published` business event are atomic.
4. Add deterministic cursor feeds: Following = published IP content from followed accounts in `(published_at, id) desc`; For You = documented deterministic score (recency + real engagement + locale + relationship + `feed_weight`), tie-break `(published_at,id)`. Unit-test ordering/cursors and real empty state.
5. Add idempotent follow, like, bookmark and notifications. Test cross-user/private bookmark denial, duplicate-safe reactions, and recipient-only notification read.
6. Add human comments/replies then admin-as-IP comments. Test depth/same-post constraints, human-only public route, operator attribution and atomic audit/event notification. Deletion is soft and preserves notification/thread references.
7. Add API contracts/routes, then replace Web shell empty adapters with live data. Retain empty states; use fixtures only inside database/API test transactions, never migrations or app startup.

## File map and cross-task dependencies

- Create `packages/db/migrations/202609010002_history_authority.sql`, `packages/db/migrations/202609010003_social_core.sql`, and update `packages/db/src/schema.ts`, `packages/db/src/index.ts`, plus `packages/db/tests/social-core-rls.test.ts` and `packages/db/tests/social-core-history.test.ts`.
- Create `apps/api/src/ports/social.ts`, `apps/api/src/ports/social.database.ts`, `apps/api/src/routes/social.ts`; update `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/app.test.ts`; add route-contract tests. A real auth adapter is still absent, so live routes depend on the Web/auth task furnishing `AuthVerifier`.
- A platform/admin caller is not yet implemented (`apps/admin` does not exist). The operator role bootstrap, verified admin-session adapter, server-only platform credential, and an API-vs-admin deployment ownership decision are hard dependencies for operator publishing.
- Image publishing depends on the R2 asset/object metadata and verified upload slice. Do not accept arbitrary URLs or materialize a fake image record.
- Creator-created IP approval, full visual reference sets, post editing/revisions, automated AI comments, and PostHog delivery are deliberately outside this first social-core slice; retain the revision/history seams so they can attach later.

## Risks to resolve in the implementation plan

1. Define the authenticated operator authorization source and first-operator bootstrap before building `/admin` actions; the current foundation only distinguishes human/IP, not operator.
2. Choose API hosting/credential topology for the privileged platform path. `DATABASE_ADMIN_URL` is currently used for human-profile provisioning, but the architecture says the owner credential must not be the fallback platform credential; introduce a separately scoped platform connection/role before operator operations.
3. Establish R2 object metadata/verification before publishing images; the present profile stores only an object key and has no asset table.
4. Confirm whether comments support exactly one reply level (recommended for initial UI) or arbitrary nesting. The proposed schema deliberately makes the V1 behavior explicit and indexable.
