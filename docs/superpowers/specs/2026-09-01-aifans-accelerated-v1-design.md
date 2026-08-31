# AIFANS Accelerated V1 Scope

**Date:** 2026-09-01  
**Status:** Approved

## Goal

Ship a bilingual, responsive, production-deployable social Web product in which only platform-controlled AI/IP accounts publish top-level content. V1 proves the social experience, creator workflow, manual operations, and AI/IP chat without committing the product to an unfinished Agent architecture.

## Publishing and comments

- Registered human accounts cannot publish top-level posts.
- Platform operators create posts in the admin application, choose an AI/IP identity, and publish as that identity.
- Human users can comment on posts and reply within supported comment threads.
- Platform operators can create selected comments as an AI/IP identity from the admin application.
- Every operator-authored post or comment records the acting operator, represented AI/IP identity, timestamp, and source for audit and later data analysis.
- Automatic post generation, automatic publishing, and AI-authored comment generation are deferred. Future workflows must use the same server-side publishing commands and cannot bypass authorization or audit logging.

## Chat

- The Web product includes first-party AIFANS chat screens; it does not embed Dify's Web UI.
- Browser clients call AIFANS APIs only. Dify credentials remain in server-only Vercel environment variables.
- A provider-neutral `ChatProvider` boundary isolates the product from Dify-specific request and response formats.
- V1 supplies a Dify adapter and supports streamed replies through HTTP/SSE; WebSocket is not required.
- Neon stores AIFANS conversation ownership, participant/IP mapping, provider conversation identifiers, message history needed by the product, timestamps, and delivery state.
- A later Agent or memory provider can replace Dify without changing the Web chat contract or losing AIFANS-owned conversation history.

## Creator workflow

- Any registered user may enable Creator Mode while the rollout switch is enabled.
- Creators can submit AI/IP identity cards and reference-image candidates, select preferred references, see public attribution and view analytics for their IPs.
- Creators do not publish or operate their IP accounts directly.
- Material profile changes and deletion/unpublishing requests require platform approval.
- Public IP profiles display `Created by @creator`.

## Deferred from V1

- Agent runtime selection and orchestration
- Long-term AI memory and vector retrieval
- Automatic content generation and publishing schedules
- AI-generated comment participation
- Autonomous IP operation

These are extension phases, not launch dependencies. V1 will not build placeholder engines or speculative memory tables for them.

## Delivery approach

- Reuse maintained UI components and managed infrastructure for commodity behavior.
- Build AIFANS-specific authorization, audit, creator approval, IP attribution, and operator impersonation controls in-house.
- Use empty production states rather than mock content. Automated tests may use isolated disposable fixtures.
- Apply focused review to database permissions, authentication, operator-as-IP actions, secrets, and deployment boundaries. Routine UI and CRUD work use consolidated feature-level verification instead of per-component review cycles.

## V1 acceptance boundary

V1 is ready for public testing when a user can register, browse AI/IP feeds and profiles, follow, like, bookmark, comment, receive core notifications, chat with an AI/IP through Dify, create an IP through Creator Mode, and inspect their IP analytics; and when an operator can manage AI/IP profiles, manually publish posts and selected comments, and approve creator requests. The application must deploy to Vercel against Neon with PostHog behavioral analytics and no browser-exposed privileged credentials.
