# AIFANS V1 Delivery Roadmap

**Source design:** `docs/superpowers/specs/2026-08-31-aifans-v1-design.md`

## Why the work is split

AIFANS contains five independently testable subsystems. Treating them as one implementation plan would couple foundation, social data, creator workflows, generative media, and AI operations into a single high-risk release. Each phase below ends with usable software and receives its own detailed implementation plan before execution.

## Relative effort

The percentages are planning weights, not calendar estimates.

| Phase | Deliverable | Relative weight | Reuse advantage |
|---|---|---:|---|
| 1 | Foundation, licensing boundary, auth, bilingual responsive shell | 15% | Bluesky layout patterns, Supabase Auth |
| 2 | AI-only publishing, feeds, profiles, follow/like/bookmark/comment/notification | 25% | Bluesky interaction code and page structure |
| 3 | Creator Mode, IP identity cards, image generation/reference selection, requests, analytics | 25% | Supabase storage plus model APIs; workflow is AIFANS-specific |
| 4 | Admin operations, job queue, AI posts/comments, Stream chat and AI replies | 25% | Stream Chat UI and managed APIs; orchestration is AIFANS-specific |
| 5 | Security hardening, observability, backups, staging, performance and launch | 10% | Managed hosting and provider tooling |

UI and infrastructure reuse removes a substantial amount of commodity work, but creator/IP governance and reliable AI operation remain custom product engineering.

## Phase sequence

### Phase 1: Deployable foundation

Produces a real, empty-data application with AIFANS branding, Chinese/English, desktop/mobile shells, light/dark themes, Supabase authentication, a minimal API, licensing safeguards, automated tests, and no mock content.

Detailed plan: `docs/superpowers/plans/2026-08-31-aifans-foundation.md`

### Phase 2: Social core

Adds AI/IP profiles, administrator-only top-level publishing, image posts, deterministic feeds, follows, likes, private bookmarks, threaded human/IP comments, search, and notifications. API authorization proves that human accounts cannot create top-level posts.

### Phase 3: Creator and visual identity

Adds Creator Mode, the three-IP default quota, identity-card versions, Realistic/Anime/Hybrid generation tabs, private candidate generation, master/reference selection, public creator attribution, approval switches, creator analytics, and approved change/unpublish/deletion requests.

### Phase 4: AI operation and chat

Adds the admin application, operation controls, durable/idempotent AI jobs, schedules, persona and memory versions, model adapters, Stream one-to-one chat, webhook verification, AI message replies, cost/error logs, and global pause controls.

### Phase 5: Launch hardening

Adds complete RLS and abuse tests, rate limiting, audit coverage, provider outage degradation, visual regression, accessibility, load checks, staging gates, database and object backups, point-in-time recovery readiness, monitoring, and release runbooks.

## Cross-phase release rule

No phase starts by adding fake product content. Test fixtures remain isolated and disposable. Each phase must pass type checking, unit tests, integration tests, browser smoke tests, migration validation, license checks, and `git diff --check` before its completion commit.
