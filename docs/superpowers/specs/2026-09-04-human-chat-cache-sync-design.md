# Human chat cache and incremental sync design

## Goal

Make the human-message experience stable while preserving the existing server-side authority, access control, idempotency, outbox, WebSocket gateway and private R2 media model. A background refresh, reconnect, read receipt or attachment renewal must never replace loaded chat content with a loading state.

## Scope

This changes the Web chat client only. It keeps the existing human-chat HTTP contracts, cursor and sequence semantics, WebSocket event contracts, R2 bucket policy and server authorization rules. It does not add persistent browser storage for private messages or media, alter production configuration, or change user relationships.

## Current failure mode

`HumanMessagesWorkspace` owns list fetching, WebSocket lifecycle, fallback polling and the revision shared with `HumanConversationDetail`. Its 15-second timer invokes the same `changed` callback used by realtime events and reads. `changed` refetches the inbox and increments the revision; the detail responds by aborting and re-fetching history with `loading=true`. This creates a full-screen loading indicator even when content is already known.

Private attachment URLs are held by individual `HumanMediaMessage` instances. They are correct short-lived, authorized URLs, but a remount loses them. The current orchestration makes such remounts unnecessarily likely.

## Chosen architecture

Use a single in-memory client query cache for human chat. TanStack Query is the chosen implementation because it provides established request de-duplication, background revalidation, cancellation, pagination, targeted invalidation and structural sharing. It is a client cache, not a second source of truth: PostgreSQL/API responses remain authoritative.

Query keys are scoped by the authenticated human profile ID:

- `["human-chat", profileId, "inbox"]` for cursor-paginated conversations.
- `["human-chat", profileId, "conversation", conversationId]` for cursor-paginated message history.
- `["human-chat", profileId, "attachment", attachmentId]` for the private media access descriptor.

The account scope is mandatory. On logout, account change or `access_revoked`, all matching cache entries and object URLs are removed before a new account can render them.

## Initial rendering and cache lifecycle

Server-rendered data seeds the matching query only for the authenticated snapshot viewer. The client uses the seeded data immediately. A loading UI is allowed only when the selected query has no usable data. If cached data exists, `isFetching` is not rendered as a loading notice and does not reset scroll position, composer state, message components or attachments.

The cache is in memory only. It survives navigation inside the current tab and is cleared when the document session ends, account changes, or access is revoked. This avoids retaining private content across a later browser session while still giving normal chat navigation its expected stability.

## Synchronization

WebSocket remains the primary path. A `message` event is validated, merged by message ID and sequence into only its conversation query, and updates only the affected inbox summary. A `read` event updates only the affected receipt and summary. Presence and typing remain ephemeral UI state and never trigger a history fetch.

WebSocket authentication success performs one silent catch-up for active queries and re-subscribes. It does not force a loading state. A transient ticket, socket or transport failure is `reconnecting`, not `auth-required`; only an explicit authentication or authorization rejection ends reconnect attempts.

Fallback polling is enabled only while the active WebSocket is unavailable and the document is visible. It is scoped to active queries, uses a bounded exponential interval, requests messages after the last known sequence, and merges results silently. It stops once the socket is ready. Inbox polling is separate and only reconciles changes needed to discover a conversation not currently subscribed.

Focus and visibility changes request silent reconciliation only when the cached query is stale or the socket is unavailable. They do not call `router.refresh` for chat data.

## Optimistic sending and read receipts

A send creates an optimistic, pending message in its own conversation query. The API confirmation or a matching realtime event replaces it by client-request ID or message ID. A failure marks only that message retryable.

Read receipts update the local cursor optimistically after the server acknowledgement. They neither re-fetch the inbox nor force a history refresh. The monotonic server cursor remains the conflict resolver.

## Private media

The attachment cache stores a validated access descriptor, never a permanent public URL. It holds the short-lived URL and expiry in memory, scoped by viewer profile and attachment ID. A renewal starts before expiry and retains the last usable URL while the replacement is fetched. The media component shows a loader only before its first successful descriptor; a renewal is invisible. If a request fails, only that attachment exposes retry.

No private attachment descriptor is persisted to local storage, IndexedDB or a service-worker cache. After logout, access revocation or an account switch, the descriptor cache is cleared and future download requests must pass server authorization. Public profile media remains on its existing public cache policy.

## Component boundaries

- `HumanChatQueryProvider`: owns the profile-scoped query client and cache cleanup boundary.
- `useHumanInbox`: owns inbox pagination and silent reconciliation.
- `useHumanConversation`: owns one conversation's sequence-aware pagination, merge and send state.
- `HumanRealtimeCoordinator`: owns one authenticated socket, subscriptions, explicit reconnect state and targeted cache updates. It does not render or fetch full pages.
- `useHumanAttachment`: owns descriptor validation, expiry-aware renewal and cleanup.
- Presentational list, detail and media components render query data only; they do not own timers, abort controllers or cross-conversation revisions.

## Error behavior

No-data initial failures render the existing unavailable state and retry control. Cached-content failures preserve content and use a small non-blocking status only when user action is needed. Authentication failure follows the existing sign-in route. An `access_revoked` event immediately removes that conversation and its attachments, then shows the existing access-changed state.

## Acceptance criteria

1. With an open loaded conversation and no new messages for at least two minutes, no loading label appears and no message/attachment node remounts.
2. A realtime message changes only that conversation and its list summary; unrelated conversations and attachments do not re-render.
3. While disconnected, a visible active conversation silently catches up from its latest sequence. Reconnection stops fallback polling and preserves scroll/composer state.
4. Navigating list → conversation → list → same conversation in one tab reuses loaded private image and voice media without a loader.
5. Near attachment expiry, renewal keeps the already visible media in place. A failed renewal affects only that attachment.
6. Logout, account change, block or access revocation clears the matching private data and prevents subsequent media access.
7. Automated tests cover query merge ordering/idempotency, no-loading background sync, fallback activation/deactivation, optimistic send reconciliation, attachment renewal and cache clearing. Browser acceptance covers the user-reported refresh and attachment sequence.

## Migration order

Introduce the profile-scoped query provider and typed fetchers first, then migrate inbox/history reads, realtime cache updates, fallback synchronization, optimistic mutations and attachment renewal. Remove the shared `revision`, unconditional interval and component-owned fetch state only after equivalent tests pass. The existing server routes and transport tests remain as regression coverage.
