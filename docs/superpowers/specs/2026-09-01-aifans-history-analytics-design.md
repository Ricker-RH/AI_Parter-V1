# AIFANS History and Product Analytics Design

**Date:** 2026-09-01  
**Status:** Pending written-spec review  
**Scope:** Business history, auditability, server-side conversion events, and Web product analytics.

## 1. Decision

AIFANS uses a hybrid analytics architecture:

- Neon PostgreSQL is the source of truth for business state, immutable revisions, workflow transitions, audit records, AI-operation records, and authoritative server-side conversion events.
- PostHog stores high-volume Web behavior such as page views, clicks, sessions, funnels, retention, and client-side product events.
- An AIFANS analytics adapter isolates PostHog from product components and allows the provider to be replaced later.
- A transactional outbox reliably forwards selected authoritative Neon events to PostHog without making a product transaction depend on PostHog availability.

PostHog data is analytical evidence, not authorization state and not the source of truth for counts, ownership, approvals, publishing, or billing-like records.

## 2. Data classes

### 2.1 Current business state

Normalized product tables hold the current state used by the application: profiles, IPs, posts, comments, relationships, requests, settings, and AI jobs. Product reads do not reconstruct ordinary current state from analytics events.

### 2.2 Immutable revisions

Mutable business objects that require later comparison use immutable revision rows. V1 requires revision history for:

- IP identity cards and persona definitions;
- IP appearance definitions and selected reference-image sets;
- creator change requests and their proposed revisions;
- platform operation rules, model configuration, and schedules;
- published post content when edited, withdrawn, or regenerated.

Each revision stores an entity ID, monotonically increasing version, immutable payload or normalized revision fields, creator/actor, creation time, and optional previous-revision ID. The live entity points to its approved/current revision. Historical revisions are never overwritten.

### 2.3 Workflow transitions

`workflow_transitions` records state-machine movement for IP submissions, change requests, unpublish/delete requests, posts, reports, and AI jobs. Each row records:

- entity type and ID;
- previous and next state;
- actor profile ID or system actor;
- reason code and optional operator note;
- request ID and occurrence time.

The application writes the state change and transition record in one database transaction.

### 2.4 Audit events

`audit_events` is append-only and records security- and operations-relevant actions. It contains event ID, occurred time, actor type/ID, action, entity type/ID, request ID, source application, result, and a redacted JSON change summary.

Audit payloads never contain passwords, tokens, cookies, database URLs, raw private messages, model-provider secrets, or signed object URLs. Ordinary application roles cannot update or delete audit rows.

### 2.5 Authoritative business events

`business_events` records completed server-side facts used for conversion and operational analysis. It uses a unique UUID event ID, event name, schema version, occurred time, actor/profile ID, subject entity IDs, request ID, deployment environment, and allow-listed JSON properties.

Examples include:

- `account_registered`;
- `onboarding_completed`;
- `creator_mode_enabled`;
- `ip_draft_created`;
- `ip_generation_completed` and `ip_generation_failed`;
- `ip_submission_completed`;
- `ip_approved` and `ip_published`;
- `follow_created`;
- `comment_created`;
- `conversation_started`;
- `ai_reply_completed` and `ai_reply_failed`.

Only the server emits authoritative completion events. A button click is not treated as a completed business outcome.

## 3. Transactional outbox

When a transaction produces a business event that PostHog should receive, it also inserts `analytics_outbox` in the same transaction. The row contains event ID, destination, payload version, redacted payload, creation time, attempt count, next-attempt time, delivered time, and last error code.

The worker:

1. claims a bounded batch using row locking with skip-locked semantics;
2. sends each event with the stable event UUID for deduplication;
3. marks success only after PostHog acknowledges ingestion;
4. retries transient failures with bounded exponential backoff and jitter;
5. moves permanently invalid payloads to a failed state for operator inspection.

Product requests never wait for PostHog. Replaying the outbox is idempotent. Delivery metadata may be compacted later, but the authoritative `business_events` row remains.

## 4. Web analytics

The Web app exposes a typed `AnalyticsProvider` with `page`, `identify`, `reset`, and `capture` operations. Feature components call domain-specific analytics functions rather than importing the PostHog SDK directly.

V1 enables PostHog page-view/session collection and a deliberately small set of custom events. Broad autocapture is not used as a substitute for the tracking plan. Sensitive input values and private content are excluded from capture.

Initial client events are:

- `landing_viewed`;
- `sign_up_started`;
- `sign_in_started`;
- `feed_tab_selected`;
- `search_performed` with query length/category, never raw query text;
- `ip_profile_viewed`;
- `post_viewed`;
- `creator_center_viewed`;
- `ip_creation_step_viewed`;
- `generation_requested`;
- `master_image_selected`;
- `submission_clicked`;
- `chat_opened`.

Client attempt events and server completion events remain distinct. For example, `submission_clicked` measures interface intent while `ip_submission_completed` is the authoritative conversion.

## 5. Event contract

Event names use lowercase snake case and describe one stable fact. Every custom event includes `event_version: 1`. A compatible property addition does not change the version; a semantic breaking change increments it.

Common allow-listed properties are:

- `event_id` for server/outbox events;
- `profile_id` after authentication;
- PostHog anonymous distinct ID before authentication;
- `session_id`;
- `request_id` for server-correlated events;
- `route_name`, using a route template rather than a URL containing IDs;
- `locale` (`en` or `zh-CN`);
- `app_version` and `deployment_environment`;
- `referrer_category` and campaign identifiers;
- coarse device/viewport category;
- relevant entity IDs, action source, creation step, visual type, and result code.

Events never contain raw passwords, email addresses, access tokens, cookies, database credentials, private-message bodies, comments or post text, full search queries, private persona prompts, generated-image prompts, or unrestricted model input/output.

## 6. Identity and sessions

Anonymous visitors use PostHog's generated anonymous distinct ID. After successful authentication, the Web adapter identifies the user with the stable AIFANS profile UUID, not the provider auth subject or email. On logout it resets the client identity so the next visitor does not inherit the previous session.

Server events use the AIFANS profile UUID and stable event UUID. The database keeps request IDs so an operator can correlate a UI attempt, API request, business event, audit event, and outbox delivery without copying sensitive payloads between systems.

AI/IP profiles are event subjects, not browser identities. Platform automation uses a system actor and identifies the affected IP separately.

## 7. Initial analysis model

The first dashboards and queries measure:

- acquisition: landing visits → sign-up starts → completed accounts;
- activation: account registration → onboarding → first follow/comment/chat;
- creator funnel: Creator Center → draft → generation → master selection → submission → approval → publication;
- content engagement: real profile/post views → follows, likes, bookmarks, comments, and chats;
- retention: returning activated humans by weekly cohort;
- IP performance: followers, unique viewers, engagement rate, chat starts, and AI-reply success;
- AI operations: job success, retry rate, latency, provider/model cost, and failure codes.

Metrics derived from business facts use Neon as the authoritative numerator/denominator. PostHog is used for behavioral funnels, sessions, paths, and retention; discrepancies are reconciled using event/request IDs.

## 8. Reliability and retention

- Client analytics failure never blocks product interaction.
- The client SDK batches and flushes through its supported transport; feature code implements no custom reconnect loop.
- Duplicate client events are tolerated analytically; server business events deduplicate by event UUID.
- Neon business revisions, workflow transitions, audit events, and business events are retained indefinitely in V1.
- Delivered outbox rows may be archived after 90 days while the matching business event remains.
- PostHog behavior retention follows the selected account plan; no critical business history exists only in PostHog.

High-growth tables use time-oriented indexes from V1 and gain time partitioning only after measured volume justifies it. The initial design avoids premature partition-management complexity.

## 9. Access and security

Public and ordinary authenticated database roles cannot read raw audit, outbox, or private revision data. Creator analytics APIs expose aggregates for only the creator's own IPs; creators do not receive raw viewer identities, private chats, prompts, or internal model configuration.

PostHog project keys safe for browser ingestion may be public. Personal API keys, server ingestion secrets, export credentials, and administrative keys are server-only. Production and preview projects/environments remain distinguishable through event properties and provider configuration.

## 10. Verification

Automated tests must prove:

- state changes and their workflow/audit/business records commit or roll back together;
- immutable revisions cannot be updated by application roles;
- audit and outbox rows cannot be mutated by public/user roles;
- outbox retries are idempotent and permanent failures are inspectable;
- typed event helpers reject unknown names, versions, and non-allow-listed properties;
- logout resets analytics identity;
- sensitive form fields, messages, search text, prompts, and secrets never enter analytics payloads;
- server completion events are emitted only after their business transaction succeeds;
- analytics provider failure does not fail the user action.

Tests use isolated ephemeral fixtures and contain no seeded product activity.

## 11. Delivery order

1. Complete the current Neon profile/settings foundation.
2. Add shared event contracts and audit/business-event/outbox tables before feature tables begin producing events.
3. Add revision and transition tables alongside the IP/creator workflows they protect.
4. Add the PostHog adapter with the Web shell and auth lifecycle.
5. Instrument each product slice only when its server behavior exists.
6. Add dashboards after real internal activity is available; do not populate them with fabricated events.

No PostHog account credentials are required until Step 4. The provided Neon owner credential is used only for reviewed migrations after local tests pass.
