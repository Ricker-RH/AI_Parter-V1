# Social chat: test release design

Status: consolidated from approved conversation; written-spec review pending. No production migration or paid provisioning authorized.

## Scope and existing implementation

Retain Vercel Web/API, Neon PostgreSQL and R2. Add Cloudflare Workers / SQLite-backed Durable Objects for realtime transport. Do not add Ably, Redis or a VM. Existing `packages/contracts/src/chat.ts`, `packages/db/src/chat.ts` and `apps/api/src/routes/chat.ts` implement human-to-IP text conversations; preserve their history and reuse the Dify adapter. Existing profile visual assets are not to be rebuilt.

Deliver in three integrated slices: (1) human profile/privacy/follow/block and persistent conversation permissions, (2) authenticated realtime transport and human/AI text, (3) media and responsive interaction completeness. All slices remain required for complete feature acceptance; a text demo is not full completion.

## Product behavior

- Human and IP avatars use a consistent preview and profile/follow/chat entry. Human profiles retain four tabs, IP profiles retain two. Human historical author avatars resolve current profile assets.
- A human's private setting keeps basic identity visible but locks all four tabs for other visitors, with a hidden-content explanation. The owner keeps access. Tab data endpoints enforce privacy, not just the UI.
- Human follows generate deduplicated notifications with follow-back. Blocking removes follows both ways and prevents new messaging both ways; history remains accessible to its participants. Unblocking restores neither follows nor first-contact allowance. Notifications and presence must not leak blocked-user activity.
- A human pair can send only one first-contact message in total before becoming mutual followers. Further sends in either direction require mutual follows. Serialize the pair-level policy check and message insert in a database transaction. Retried requests do not consume another allowance; deleting a conversation, unfollowing or unblocking cannot reset it. AI chats use separate eligibility rules and never require an AI to follow a human.
- Inbox supports unread counts; conversation supports saved/read receipts, typing and online/offline. Only mutual human contacts can observe presence, subject to the user's presence preference. Unknown/stale presence is not asserted as online. Typing expires and temporarily replaces the peer name. AI shows generating/failure states, not human online/read claims.
- Include text, emoji, images, camera capture where supported, voice recordings, a small license-safe sticker set and internal share cards. This is recorded voice, not live voice/video calls. Permission denial or unsupported capture has a clear fallback. No third-party sticker catalogue integration.
- Reuse current inbox layout, secondary-page headers, Avatar, spacing, icons and composer patterns. Mobile and desktop keep current navigation conventions; do not invent a parallel visual system.

## Data and transport boundaries

- PostgreSQL remains authoritative for profiles, follows, blocks, privacy, conversation membership, messages, per-conversation ordering, deduplication keys and per-member read cursors. Use explicit HUMAN/IP participants without rewriting existing IP history. Additive migrations and compatibility tests precede any cutover.
- A versioned event contract separates transport from UI/business rules. Client adapter exposes connect, disconnect, send and subscription; server adapter publishes authenticated events. A configured endpoint selects an implemented adapter, not arbitrary protocol compatibility. Implement only Cloudflare now.
- Durable Objects coordinate connections and transient presence; they do not independently decide social permissions. Browser commands enter the authenticated service boundary and use the same authorized business operations as HTTP. Never trust browser-supplied sender IDs or membership claims.
- Save messages and a delivery/outbox record atomically before acknowledgement. Retry delivery safely; event IDs and durable cursors support deduplication and reconnect catch-up. No exactly-once network promise. Read cursors advance monotonically only within the caller's membership and valid message range.
- Dify remains server-to-server HTTP/SSE behind its existing provider interface. Missing configuration disables AI sending with an honest explanation, not synthetic replies. Persist generation status, distinguish partial/failed/completed answers and reconcile disconnects without duplicate human messages or uncontrolled repeated billable generations. Media support must follow the configured Dify application's capabilities, not assume every application accepts every format.
- R2 stores media bytes; PostgreSQL stores ownership, type, size and references. Chat attachments use private storage with short-lived authorized retrieval, separate from public profile assets. Upload completion validates actual content and ownership before it becomes sendable. Enforce format/size/duration limits, safe rendering and bounded processing. No public URL for private conversations.

## Baseline security: required before test acceptance

- Authenticate HTTP and WebSocket; allow only configured Web origins. Prefer a short-lived, single-use, audience-bound connection ticket from an authenticated same-origin endpoint. Keep credentials out of URLs/logs, bound unauthenticated connection lifetime, and reject expired/replayed tickets. Recheck session validity and authorization for commands and subscriptions; origin checking alone is not authentication.
- Enforce participant authorization on history, send, read receipts, subscriptions and every attachment retrieval. Database grants/RLS and service-role boundaries must not allow user-supplied profile identity to bypass policy.
- Recheck block/mutual rules transactionally; propagate permission changes to active connections. Rate-limit connection attempts, messages, first contacts, uploads and AI requests; bound payloads, queues and outstanding work.
- Keep Dify, R2, database and internal-service secrets server-side; redact logs. Render untrusted messages as text or sanitized approved content. Internal share cards resolve authorized IDs, not arbitrary fetched URLs.
- Separate test/production database resources, realtime namespaces, origins, buckets or enforceable storage boundaries, secrets and deployments. Do not weaken Preview protection globally to get WebSockets working. Validate the authenticated cross-service handshake explicitly.
- Add adversarial tests for cross-account history/media/subscription access, forged sender IDs, ticket replay/expiry, concurrent first sends, duplicate retry, blocked active sessions and private-tab direct access.

## Verification and operational boundaries

Each slice requires targeted unit/API/database tests and then integration review. Final acceptance uses two separate authenticated browser contexts: first contact and mutual gate, follow-back notification, block/unblock, privacy, real message delivery/read state, reconnect recovery and media authorization. Test mobile and desktop against existing UI patterns; verify actual deployed SHA and test URL. Existing tests/build must remain passing.

Free-tier resource deployment only after account access and available limits are verified; ask before paid upgrades. Record migration, Web/API/Worker versions and rollback instructions together. Apply no production data migration in this work. Release state distinguishes code complete, tests passed, test deployment ready and actual browser validation.

Commercial launch additionally requires traffic/location-based latency and capacity testing, security review, abuse/moderation policies, legal/privacy review, plan eligibility and backup/restore rehearsal. These do not replace the baseline controls above. Never claim zero security risk.

## Work ownership

Data/API worker owns schema, repository permissions and API contracts. Realtime worker owns Worker deployment, transport adapter and protocol integration after contracts stabilize. UI worker owns existing chat/profile surfaces against those contracts. Coordinator owns shared contract decisions, integration, security verification and deployment. Avoid overlapping edits; reviews follow each slice rather than implementing competing backends.
