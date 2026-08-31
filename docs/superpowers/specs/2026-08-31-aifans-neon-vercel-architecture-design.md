# AIFANS Neon and Vercel Architecture Design

**Date:** 2026-08-31  
**Status:** Pending written-spec review  
**Scope:** Replace the approved design's Supabase infrastructure references without changing AIFANS product behavior.

## 1. Decision

AIFANS will use:

- Neon PostgreSQL as the product system of record;
- Neon Auth for email/password, Google OAuth, sessions, and user identity;
- PostgreSQL row-level security for database authorization;
- Drizzle ORM and reviewed SQL migrations for typed schema access;
- the Neon serverless driver for Vercel-compatible database connections;
- Cloudflare R2 for public and private image objects;
- Stream Chat for direct messaging, unchanged from the approved product design;
- Vercel for the Web, Admin, and HTTP API deployments.

This decision supersedes only the Supabase-specific infrastructure and provider references in the approved AIFANS V1 design. Product roles, creator permissions, AI/IP publishing rules, empty-data policy, and UI scope do not change.

## 2. Alternatives considered

### Selected: Neon Auth with Neon PostgreSQL

This has the smallest operational surface for the selected database and deployment platform. Auth state can follow Neon branches, and Vercel preview deployments can use isolated database/auth environments. Neon Auth is newer than long-established standalone identity providers, so it remains behind an AIFANS auth adapter.

### Alternative: Clerk with Neon PostgreSQL

Clerk offers a mature authentication product and polished hosted components. It adds another vendor, separate identity state, webhook synchronization, and another billing surface. The adapter boundary keeps this a future replacement option.

### Alternative: self-managed Better Auth

This gives AIFANS the most control, but makes the team responsible for more authentication operations, security updates, and recovery behavior. That maintenance cost is not justified for V1.

## 3. Application boundaries

Browser components never receive a database owner connection string and never query product tables directly. They call the AIFANS API through the shared typed domain client.

The Web and Admin applications use Neon Auth through an `AuthProvider` adapter. The API verifies the caller's session, derives a trusted actor context, and opens database work through a `DatabaseProvider` adapter. Page components do not import Neon, Drizzle, R2, or Stream SDKs.

The API has two explicit database execution paths:

1. **User-scoped path:** uses a dedicated non-owner PostgreSQL login held only by the API, sets verified actor claims for the current transaction, and remains subject to RLS. Browsers and arbitrary-SQL clients never receive this credential and therefore cannot forge the claims GUC.
2. **Platform path:** used only by approved admin operations, webhooks, and AI workers through a separate privileged credential. Every privileged mutation records an audit event.

The privileged credential is server-only and cannot enter Web bundles, logs, browser responses, or preview artifacts. The Neon owner credential is reserved for reviewed migrations and platform provisioning and is never used as the fallback for user-scoped requests.

## 4. Identity and authorization

Neon Auth owns credentials, OAuth linkage, sessions, recovery, and its internal auth schema. AIFANS owns a separate `profiles` row keyed by the immutable authenticated user identifier.

New identities receive one human profile through an idempotent server-side provisioning flow. The default account kind is always `human`. Public or owner-facing profile updates cannot change:

- profile ID;
- account kind;
- creator ownership relationships;
- creation timestamps;
- platform-managed status or operation fields.

RLS remains a required defense layer. It protects owner-only profile updates, private bookmarks, creator drafts, creator analytics, change requests, and other user-scoped records. Public profile and published-content reads use narrowly defined public policies. Platform-only tables and mutations have no public client grants.

The API never trusts a user ID supplied in a request body as the acting identity. It derives the actor from the verified Neon Auth session and supplies that identity to the database transaction. Human top-level posting is independently rejected by both application authorization and database constraints/policies.

## 5. Schema and migrations

Drizzle defines tables, enums, indexes, relationships, and inferred TypeScript types. Hand-reviewed SQL migrations define security-sensitive behavior that is clearer or safer in SQL, including RLS policies, grants, trigger functions, immutable-field enforcement, and database roles.

Migrations are forward-only in shared environments and include repair guidance for non-trivial changes. Development and test databases contain no seeded users, IPs, posts, comments, counters, or chat history. The single global platform-settings row is required configuration rather than demo content.

Local development uses Docker PostgreSQL. Automated authorization tests create ephemeral fixtures inside transactions and roll them back. Production-like checks run against an isolated Neon development or preview branch before release; they never run destructive reset commands against production.

## 6. Image storage

Cloudflare R2 stores avatars, covers, post images, and private IP-generation assets. Neon stores only object metadata, ownership, visibility, content type, size, checksum, lifecycle state, and object key.

Upload flow:

1. an authenticated client requests an upload authorization from the API;
2. the API validates purpose, ownership, content type, size, and quota;
3. the API issues a short-lived signed upload request;
4. the client uploads directly to R2;
5. the API verifies the completed object before marking its metadata usable.

Private creator-generation assets use private object keys and short-lived signed reads. Public delivery uses a dedicated asset domain. Object keys are generated by the platform and never use unsanitized filenames. Database deletion does not silently orphan or immediately destroy objects; cleanup runs through an idempotent job with an audit trail.

## 7. Vercel deployment

Vercel hosts the Next.js Web and Admin applications and the HTTP API where its execution limits fit. Long-running AI generation and durable scheduled jobs remain separate workers rather than Vercel request handlers.

Production, preview, and development use separate secrets. The Neon/Vercel integration supplies database and auth configuration to the correct deployment environment. Preview deployments use isolated Neon branches when enabled. Production uses pooled/serverless connections, bounded transaction duration, and explicit timeouts.

Cloudflare R2, Stream, model-provider, webhook, and privileged database credentials are server-only. Public environment variables are limited to values intentionally safe for browsers.

## 8. Failure behavior

- Invalid or expired auth sessions return a typed `401` response and do not open privileged database work.
- RLS denial returns a typed authorization error without exposing policy or schema details.
- A suspended Neon compute may add cold-start latency; the API uses bounded retries only for safe, idempotent reads.
- R2 upload failures leave metadata uncommitted or marked failed and are safe to retry.
- Missing R2 objects render a recoverable media state; they do not remove the associated database record automatically.
- Provider outages do not weaken permissions or fall back to owner credentials.

Every response includes a request ID. Server logs redact tokens, cookies, database URLs, signed object URLs, and message content unless an explicitly approved diagnostic path requires otherwise.

## 9. Verification

The foundation must prove:

- schema migrations apply to a clean Docker PostgreSQL database;
- migrations apply to an isolated Neon branch before production use;
- anonymous users can read only intended public data;
- owners can edit only approved profile columns;
- cross-user mutations fail;
- humans cannot change `account_kind` or create top-level posts;
- client roles cannot insert/delete profiles or mutate platform settings;
- the current-account lookup returns only the authenticated actor;
- privileged operations require the platform path and produce audit records;
- no server secret appears in browser bundles;
- R2 authorization rejects invalid purpose, type, size, ownership, and expired requests.

Tests may use ephemeral fixture rows in isolated test databases and must clean them up. Product environments remain empty until real users or administrators create data.

## 10. Operational consequences

No product capability is removed. The implementation changes from Supabase SDK conventions to provider-neutral AIFANS adapters backed by Neon and R2.

Before hosted integration work begins, the user will provide or authorize access to:

- a Neon project with Neon Auth enabled;
- a Vercel project connected to the GitHub repository;
- a Cloudflare account and R2 bucket;
- Google OAuth credentials when Google sign-in is enabled.

Local schema, migration, API contracts, UI, and Docker authorization tests can proceed before those hosted credentials are available.
