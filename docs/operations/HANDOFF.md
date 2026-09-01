# AIFANS project handoff

This document lets a fresh development environment continue without relying on
the original chat history. Source code and safe project evidence live in Git;
credentials and hosted data remain in their managed services.

## Source of truth

- Repository: https://github.com/Ricker-RH/AI_Parter-V1
- Production branch: `main`
- Working feature branch retained for history: `codex/aifans-foundation`
- At this handoff both branches point to `a6d02a9`.

Always run `git fetch`, switch to `main`, and use `git pull --ff-only` before new
work. Inspect `git status` before editing and preserve unrelated user changes.

## Product scope now implemented

- Bilingual responsive Web shell in Chinese and English
- Neon Auth registration, sign-in, sign-out, recovery, session and JWT verification
- AI/IP feeds, post detail, public profiles, follow, like, bookmark and comments
- Notifications and operator-created AI/IP comments
- Isolated admin shell for creating AI/IP identities and publishing text/image posts
- Creator Mode submission and review workflow with public creator attribution
- Cloudflare R2 private creator references and public post media
- Provider-neutral Dify chat seam and first-party chat UI
- PostHog browser analytics plus server outbox delivery
- Neon history, audit, RLS, bounded capability roles and runtime rate limiting

Automatic AI content generation, autonomous posting, Agent orchestration and
long-term memory remain intentionally deferred.

## Managed services

### Vercel

The Web and API are separate Vercel projects. The Web talks to the API through
server-side same-origin BFF routes. Do not introduce a browser-direct API URL.

Web production URL:

- https://ai-parter-v1-web.vercel.app

Required Web variables are documented in `.env.example`, including:

- `AIFANS_API_URL`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `CREATOR_MODE_ENABLED`

API variables include the bounded database URLs, Neon JWT settings, rate-limit
secret, R2 configuration, analytics configuration, and optional Dify values.

### Neon

Hosted PostgreSQL contains production data and the migration ledger; it is not
copied into Git. The current hosted database has migrations `001` through `031`
applied. Runtime URLs must use separate restricted LOGIN roles for normal user,
platform, provisioning, analytics delivery, and rate limiting. Never substitute
the database owner URL for a runtime URL.

Role membership grants are defined in:

- `infra/postgres/grant-runtime-memberships.sql`

### Cloudflare R2

Buckets:

- `aifans-private`: private Creator Mode reference assets
- `aifans-public`: public post images

Both buckets allow the production Web origin and local development origin for
browser upload operations. Their CORS methods are `GET`, `PUT`, and `HEAD`, with
`Content-Type` allowed. The public bucket currently uses its Cloudflare-managed
public development URL; attach a custom media domain before higher-volume
production use.

Do not commit the R2 access key or secret. Configure them only in Vercel.

### PostHog

The US Cloud project is configured. Browser autocapture, session replay,
exception autocapture and unused remote products are disabled; AIFANS sends only
closed, sanitized event contracts. The project token is configured in Vercel,
not in Git.

### Dify

The API adapter and Web flow are implemented. `DIFY_API_URL` and `DIFY_API_KEY`
are optional and can remain absent until AI chat is enabled. Dify credentials
must stay server-only.

## Production verification snapshot

Verified on 2026-09-01:

- Production authentication and admin authorization work.
- Admin navigation remains inside the isolated admin shell.
- Hosted Neon schema and runtime capability roles support production requests.
- Two test AI/IP identities and text posts were created for production smoke testing.
- A real PNG was uploaded through the admin flow to R2, registered, published,
  returned HTTP 200 from the public object URL, and rendered on post detail.
- Image test post:
  https://ai-parter-v1-web.vercel.app/zh-CN/posts/90a75be7-81a3-4c5e-a878-652216a7d9c5

The final pre-handoff local verification reported a passing production build,
workspace typecheck, 431 tests passing with 91 environment-gated skips, Chinese
and English message-key parity, and a passing license check.

## What Git intentionally does not contain

- Passwords, API keys, database connection strings, cookie secrets or JWT secrets
- Browser sessions or account credentials
- Hosted Neon rows and migration ledger contents
- Vercel deployment history and environment-variable values
- Cloudflare account state, R2 objects and access tokens
- PostHog event data and project-token values

`AIFANS_RELEASE` may contain only a bounded public release identifier, never a secret. When available, Vercel's commit SHA is used instead.

Those are not missing development context. A maintainer with access to the
managed-service consoles can inspect or rotate them there.

## Continuation checklist

1. Pull `main` with `--ff-only` and confirm a clean worktree.
2. Read this guide plus the relevant spec/plan under `docs/superpowers`.
3. Reuse existing contracts, components, BFF routes, repositories and design tokens.
4. Do not add mock production data or weaken auth/RLS/upload boundaries.
5. Preserve Chinese/English key parity and verify desktop/mobile light/dark UI.
6. Run focused tests, workspace typecheck, production build, license and diff checks.
7. Browser-test the changed production path before reporting completion.
8. Commit and push only after verification, without secrets.
