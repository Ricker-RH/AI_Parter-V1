# AIFANS Persistent Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the UUID-entry demo chat with owner-scoped, persistent human-to-AI/IP conversations that remain readable when Dify is unavailable and render as a Threads-style desktop two-pane workspace plus mobile list/detail routes.

**Architecture:** Neon owns AIFANS conversation and message UUIDs, ownership, delivery state, and paginated history. The Dify adapter receives only a private provider conversation identifier loaded by the API repository; provider identifiers never enter public contracts or client input. Authenticated API routes expose provider-neutral list, create, history, and idempotent send commands, while the Web layer uses server reads and same-origin bounded mutation proxies.

**Tech Stack:** TypeScript, Zod contracts, Hono API, Neon PostgreSQL with RLS, Next.js App Router, React, CSS Modules, Vitest, Testing Library.

---

## File map

- `packages/contracts/src/chat.ts`: public provider-neutral schemas, cursor codecs, and API types.
- `packages/contracts/src/chat.test.ts`: schema/cursor security and compatibility tests.
- `packages/db/migrations/202609020002_persistent_chat.sql`: conversation/message storage, constraints, grants, RLS, and indexes.
- `packages/db/src/schema.ts`: Drizzle declarations matching the migration.
- `packages/db/src/chat.ts`: owner-scoped conversation and message repository.
- `packages/db/tests/chat.test.ts`: repository behavior against a real test database.
- `packages/db/tests/chat-rls.test.ts`: cross-owner and anonymous RLS denial tests.
- `packages/db/src/runtime.ts`, `packages/db/src/index.ts`: repository wiring and exports.
- `apps/api/src/ports/chat.ts`: provider-only input/output types; provider ids stay private.
- `apps/api/src/adapters/dify-chat.ts`: bounded text provider ids and Dify call mapping.
- `apps/api/src/routes/chat.ts`: authenticated list/create/history/send routes.
- `apps/api/src/routes/chat.test.ts`: authorization, validation, unavailable-provider, idempotency, and ownership tests.
- `apps/api/src/runtime-dependencies.ts`: inject the new repository into chat routes.
- `apps/web/src/lib/chat-api.ts`: authenticated server-side chat reads.
- `apps/web/src/app/api/conversations/route.ts`: same-origin create proxy.
- `apps/web/src/app/api/conversations/[conversationId]/messages/route.ts`: same-origin bounded send proxy.
- `apps/web/src/app/[locale]/messages/page.tsx`: protected conversation-list workspace.
- `apps/web/src/app/[locale]/messages/[conversationId]/page.tsx`: protected selected conversation workspace.
- `apps/web/src/components/chat/MessagesWorkspace.tsx`: responsive list/detail composition.
- `apps/web/src/components/chat/ConversationList.tsx`: real conversation summaries and empty/error pagination.
- `apps/web/src/components/chat/ConversationDetail.tsx`: history, mobile Back, loading/error states.
- `apps/web/src/components/chat/ChatComposer.tsx`: idempotent send command and honest provider-disabled state.
- `apps/web/src/components/chat/MessagesWorkspace.module.css`: fluid desktop two-pane/mobile route layout.
- `apps/web/src/components/social/PublicProfileContent.tsx`: real authenticated Chat entry.
- `apps/web/messages/en.json`, `apps/web/messages/zh-CN.json`: identical chat keys in both languages.
- `apps/web/src/components/chat/*.test.tsx`, `apps/web/src/app/[locale]/messages/*.test.tsx`, `apps/web/src/app/api/conversations/**/*.test.ts`: UI, route, and proxy regression tests.

### Task 1: Define provider-neutral conversation contracts

**Files:**
- Modify: `packages/contracts/src/chat.ts`
- Modify: `packages/contracts/src/chat.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests proving that a conversation summary contains only AIFANS ids and public IP identity, history cursors round-trip, duplicate/unknown keys fail, send input requires an AIFANS idempotency UUID, and neither `providerConversationId` nor a client-supplied provider id is accepted.

```ts
const send = ChatSendInputSchema.parse({
  message: 'Hello',
  requestId: '11111111-1111-4111-8111-111111111111',
  locale: 'en',
})
expect(send).not.toHaveProperty('conversationId')
expect(ChatSendInputSchema.safeParse({...send, providerConversationId: 'dify-1'}).success).toBe(false)
expect(decodeChatCursor(encodeChatCursor({kind: 'chat-messages', createdAt: now, id}))).toEqual({kind: 'chat-messages', createdAt: now, id})
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `pnpm --dir packages/contracts test src/chat.test.ts`

Expected: FAIL because the new schemas/codecs are not exported.

- [ ] **Step 3: Implement the schemas and cursor codecs**

Define strict schemas with these public shapes:

```ts
export const ChatConversationSummarySchema = z.strictObject({
  id: uuid,
  ipProfile: z.strictObject({id: uuid, username: z.string().min(1), displayName: z.string().min(1)}),
  lastMessage: z.strictObject({body: z.string(), role: z.enum(['human', 'assistant']), createdAt: z.iso.datetime()}).nullable(),
  updatedAt: z.iso.datetime(),
  sendEnabled: z.boolean(),
})
export const ChatConversationPageSchema = z.strictObject({items: z.array(ChatConversationSummarySchema), nextCursor: z.string().nullable()})
export const ChatMessageSchema = z.strictObject({
  id: uuid,
  role: z.enum(['human', 'assistant']),
  body: z.string(),
  deliveryState: z.enum(['pending', 'sent', 'failed']),
  createdAt: z.iso.datetime(),
})
export const ChatHistoryPageSchema = z.strictObject({conversation: ChatConversationSummarySchema, items: z.array(ChatMessageSchema), nextCursor: z.string().nullable()})
export const ChatConversationCreateInputSchema = z.strictObject({ipProfileId: uuid})
export const ChatSendInputSchema = z.strictObject({message: z.string().trim().min(1).max(4000), requestId: uuid, locale: LocaleSchema.optional()})
export const ChatSendResponseSchema = z.strictObject({humanMessage: ChatMessageSchema, assistantMessage: ChatMessageSchema.optional()})
export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('human_message'), message: ChatMessageSchema}),
  z.strictObject({type: z.literal('assistant_delta'), delta: z.string().min(1)}),
  z.strictObject({type: z.literal('assistant_complete'), message: ChatMessageSchema}),
  z.strictObject({type: z.literal('failed'), code: z.enum(['CHAT_PROVIDER_ERROR', 'CHAT_INTERRUPTED'])}),
])
```

Use tagged base64url JSON cursors for `chat-conversations` (`updatedAt`, `id`) and `chat-messages` (`createdAt`, `id`), rejecting malformed, cross-kind, non-canonical, or overlong cursor input.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --dir packages/contracts test src/chat.test.ts && pnpm --dir packages/contracts typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/chat.ts packages/contracts/src/chat.test.ts packages/contracts/src/index.ts
git commit -m "feat(chat): define persistent conversation contracts"
```

### Task 2: Add owner-scoped Neon conversation storage

**Files:**
- Create: `packages/db/migrations/202609020002_persistent_chat.sql`
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/tests/chat-rls.test.ts`

- [ ] **Step 1: Write failing migration/RLS tests**

Cover: authenticated human A cannot read or modify human B's conversation/messages; anonymous cannot read any chat record; an owner can create/read its own conversation only with a published AI/IP; provider ids are bounded; duplicate `(human_profile_id, ip_profile_id)` pairs and duplicate `(conversation_id, client_request_id)` sends are rejected.

- [ ] **Step 2: Run the DB tests and confirm RED**

Run: `pnpm --dir packages/db test tests/chat-rls.test.ts`

Expected: FAIL because the tables do not exist (or skip only when the documented DB test environment is absent).

- [ ] **Step 3: Add the migration**

Create two enums and two tables with explicit constraints:

```sql
CREATE TYPE public.chat_message_role AS ENUM ('human','assistant');
CREATE TYPE public.chat_delivery_state AS ENUM ('pending','sent','failed');

CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_conversation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversations_pair_unique UNIQUE (human_profile_id, ip_profile_id),
  CONSTRAINT chat_provider_conversation_id_bounded CHECK (provider_conversation_id IS NULL OR length(provider_conversation_id) BETWEEN 1 AND 512)
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role public.chat_message_role NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  delivery_state public.chat_delivery_state NOT NULL,
  client_request_id uuid,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_human_request_required CHECK ((role='human') = (client_request_id IS NOT NULL)),
  CONSTRAINT chat_provider_message_id_bounded CHECK (provider_message_id IS NULL OR length(provider_message_id) BETWEEN 1 AND 512),
  CONSTRAINT chat_message_request_unique UNIQUE (conversation_id, client_request_id)
);

CREATE INDEX chat_conversations_owner_cursor_idx ON public.chat_conversations (human_profile_id, updated_at DESC, id DESC);
CREATE INDEX chat_messages_conversation_cursor_idx ON public.chat_messages (conversation_id, created_at DESC, id DESC);
```

Enable RLS on both tables. Add owner SELECT/INSERT/UPDATE policies using `public.current_profile_id()` and an `EXISTS` owner check for messages. Conversation INSERT must additionally require `public.is_public_chat_ip(ip_profile_id)`. Grant only the minimum table/sequence privileges to `aifans_authenticated`; grant none to `aifans_anon` or `PUBLIC`.

- [ ] **Step 4: Mirror the tables in `schema.ts`**

Add `chatMessageRoleEnum`, `chatDeliveryStateEnum`, `chatConversations`, and `chatMessages` with the same foreign keys, unique constraints, and indexes. Do not export provider ids through any public Web/API contract.

- [ ] **Step 5: Run DB tests and migration/schema verification**

Run: `pnpm --dir packages/db test tests/chat-rls.test.ts tests/schema.test.ts && pnpm --dir packages/db typecheck`

Expected: PASS, or only environment-gated integration tests report their documented skip.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/202609020002_persistent_chat.sql packages/db/src/schema.ts packages/db/tests/chat-rls.test.ts
git commit -m "feat(db): add owner-scoped chat storage"
```

### Task 3: Implement the chat repository and idempotent delivery lifecycle

**Files:**
- Create: `packages/db/src/chat.ts`
- Create: `packages/db/tests/chat.test.ts`
- Modify: `packages/db/src/runtime.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write failing repository tests**

Test `listConversations`, `getOrCreateConversation`, `getConversation`, `listMessages`, `beginHumanMessage`, `completeProviderReply`, and `failHumanMessage`. Assert stable cursor ordering, strict owner scope, pair deduplication, repeated `requestId` returning the existing human/assistant pair, and no provider id in public projection values.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --dir packages/db test tests/chat.test.ts`

Expected: FAIL because `createChatRepository` is missing.

- [ ] **Step 3: Implement focused repository types**

Expose a repository shaped like:

```ts
export type ChatRepository = {
  listConversations(actor: Actor, input: {limit: number; cursor?: string}): Promise<ChatConversationPage>
  getOrCreateConversation(actor: Actor, input: {humanProfileId: string; ipProfileId: string; sendEnabled: boolean}): Promise<ChatConversationSummary | null>
  getConversation(actor: Actor, input: {conversationId: string; sendEnabled: boolean}): Promise<ChatConversationSummary | null>
  listMessages(actor: Actor, input: {conversationId: string; limit: number; cursor?: string; sendEnabled: boolean}): Promise<ChatHistoryPage | null>
  beginHumanMessage(actor: Actor, input: {conversationId: string; requestId: string; body: string}): Promise<
    | {kind: 'ready'; conversationId: string; humanProfileId: string; ipProfileId: string; providerConversationId?: string; message: ChatMessage}
    | {kind: 'complete'; response: ChatSendResponse}
    | {kind: 'inflight'; message: ChatMessage}
    | null
  >
  completeProviderReply(actor: Actor, input: {conversationId: string; humanMessageId: string; answer: string; providerConversationId: string; providerMessageId: string}): Promise<ChatSendResponse>
  failHumanMessage(actor: Actor, input: {conversationId: string; humanMessageId: string}): Promise<void>
}
```

All reads execute inside `runWithActor`. `beginHumanMessage` inserts `pending` with `ON CONFLICT (conversation_id, client_request_id)`: a failed row is atomically moved back to `pending` and returns `ready`; a completed row returns the stored human/assistant pair as `complete`; an existing pending row returns `inflight` so concurrent duplicates never call the provider twice. `completeProviderReply` locks the conversation, verifies the human message belongs to it, marks it `sent`, inserts one assistant message per human request, updates bounded provider ids and `updated_at`, and commits atomically. `failHumanMessage` marks only that owner's pending message `failed`.

- [ ] **Step 4: Wire runtime and exports**

Add `chat: ChatRepository` to `DatabaseRuntimeRepositories`, instantiate it with `createChatRepository(withActor)`, and export repository symbols from `packages/db/src/index.ts`.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --dir packages/db test tests/chat.test.ts tests/chat-rls.test.ts && pnpm --dir packages/db typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/chat.ts packages/db/tests/chat.test.ts packages/db/src/runtime.ts packages/db/src/index.ts
git commit -m "feat(db): persist chat conversations and messages"
```

### Task 4: Make the provider seam private and tolerant of Dify text ids

**Files:**
- Modify: `apps/api/src/ports/chat.ts`
- Modify: `apps/api/src/adapters/dify-chat.ts`
- Modify: `apps/api/src/adapters/dify-chat.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Assert Dify ids such as `conv_external_01` and `msg_external_01` are accepted, strings over 512 characters are rejected as provider errors, an absent provider conversation is sent as `''`, `response_mode` is `streaming`, split SSE frames are reassembled, text deltas arrive in order, the terminal event returns provider ids, malformed/oversized streams fail closed, cancellation aborts the upstream request, and no AIFANS response schema is used inside the adapter.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --dir apps/api test src/adapters/dify-chat.test.ts`

Expected: FAIL because the current adapter requires UUID provider ids.

- [ ] **Step 3: Replace provider types**

```ts
export type ProviderChatResponse = {
  answer: string
  providerConversationId: string
  providerMessageId: string
}
export type SendChatMessageInput = {
  humanProfileId: string
  ipProfileId: string
  message: string
  providerConversationId?: string
  locale: Locale
  requestId: string
}
```

Change the port to `streamMessage(input): AsyncGenerator<{type:'delta'; delta:string}, ProviderChatResponse>`. Parse Dify `conversation_id` and `message_id` as `z.string().min(1).max(512)`, reassemble bounded UTF-8 SSE frames, yield only validated text deltas, return the complete answer plus private ids from the terminal event, and retain current timeout/error normalization. Never expose raw Dify event names or ids outside the API route.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --dir apps/api test src/adapters/dify-chat.test.ts && pnpm --dir apps/api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ports/chat.ts apps/api/src/adapters/dify-chat.ts apps/api/src/adapters/dify-chat.test.ts
git commit -m "fix(chat): keep provider identifiers server-owned"
```

### Task 5: Add authenticated conversation APIs

**Files:**
- Modify: `apps/api/src/routes/chat.ts`
- Modify: `apps/api/src/routes/chat.test.ts`
- Modify: `apps/api/src/runtime-dependencies.ts`

- [ ] **Step 1: Write failing route tests**

Cover these exact endpoints:

```text
GET  /v1/chat/conversations?limit=20&cursor=...
POST /v1/chat/conversations                    {ipProfileId}
GET  /v1/chat/conversations/:id/messages?limit=50&cursor=...
POST /v1/chat/conversations/:id/messages       {message,requestId,locale?}
```

Assert authentication precedes repository reads, IP targets must be published, cross-owner ids return 404, duplicate query keys/unknown body keys fail, limits are bounded, create works even when Dify is absent, list/history expose `sendEnabled:false` when Dify is absent, send returns `503 CHAT_NOT_CONFIGURED` without inserting a message, completed replayed request ids return the stored pair without calling Dify, concurrent duplicates return `409 CHAT_IN_PROGRESS`, failed request ids can retry once without a duplicate human row, SSE deltas are ordered, and provider/cancellation failures persist a failed human message without leaking raw errors.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --dir apps/api test src/routes/chat.test.ts`

Expected: FAIL because list/create/history routes and the repository dependency are absent.

- [ ] **Step 3: Implement read/create routes**

Reuse `requireHuman`, strict single-value query parsing, `ChatConversationCreateInputSchema`, and bounded limits. Pass `sendEnabled: dependencies.chat !== undefined` into repository projections so history remains readable without Dify.

- [ ] **Step 4: Implement idempotent send**

The route must:

1. authenticate and resolve the owner-scoped conversation;
2. return `503 CHAT_NOT_CONFIGURED` before inserting a human message when no provider exists;
3. call `beginHumanMessage` with the AIFANS `requestId`;
4. return the stored response immediately for `complete`, or `409 CHAT_IN_PROGRESS` for `inflight`;
5. stream a `human_message` event, then call Dify with only the repository-returned `providerConversationId`;
6. emit validated `assistant_delta` events while accumulating the bounded answer;
7. call `completeProviderReply` with private provider ids before emitting `assistant_complete`;
8. call `failHumanMessage` on provider failure or cancellation and emit only a normalized `failed` code.

Keep the existing authenticated rate-limit policy and request-id propagation; remove the old `POST /v1/chat/:ipProfileId/messages` after the new route tests prove equivalent safe behavior.

- [ ] **Step 5: Wire the DB repository**

Add the repository to `ChatDependencies` and runtime dependency creation. Do not instantiate database connections in route modules.

- [ ] **Step 6: Run API verification**

Run: `pnpm --dir apps/api test src/routes/chat.test.ts src/adapters/dify-chat.test.ts && pnpm --dir apps/api typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/chat.ts apps/api/src/routes/chat.test.ts apps/api/src/runtime-dependencies.ts
git commit -m "feat(api): expose persistent owner-scoped conversations"
```

### Task 6: Add safe Web reads and mutation proxies

**Files:**
- Create: `apps/web/src/lib/chat-api.ts`
- Create: `apps/web/src/lib/chat-api.test.ts`
- Create: `apps/web/src/app/api/conversations/route.ts`
- Create: `apps/web/src/app/api/conversations/route.test.tsx`
- Create: `apps/web/src/app/api/conversations/[conversationId]/messages/route.ts`
- Create: `apps/web/src/app/api/conversations/[conversationId]/messages/route.test.tsx`
- Delete: `apps/web/src/app/api/chat/[ipProfileId]/messages/route.ts`
- Delete: `apps/web/src/app/api/chat/[ipProfileId]/messages/route.test.tsx`

- [ ] **Step 1: Write failing server-read and proxy tests**

Test provider-neutral read parsing, upstream unavailable/unauthorized mapping, same-origin enforcement before body parsing, UUID path validation, duplicate/unknown keys, 32 KiB declared and streamed request-body limits, trusted auth/request-id header forwarding, SSE content-type enforcement, abort propagation, upstream error-body preservation, and bounded pass-through of the validated AIFANS event stream.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --dir apps/web test src/lib/chat-api.test.ts 'src/app/api/conversations/**/*.test.tsx'`

Expected: FAIL because the modules are absent.

- [ ] **Step 3: Implement server reads**

`fetchConversations` and `fetchConversationHistory` call `fetchAifansApi` with the server token and parse `ChatConversationPageSchema`/`ChatHistoryPageSchema`, returning the same `ok | unauthorized | not-found | unavailable` result union used by social reads.

- [ ] **Step 4: Implement narrow proxies**

The create proxy accepts only `ChatConversationCreateInputSchema`. The send proxy accepts only `ChatSendInputSchema`. Both require exact same-origin, enforce streamed size before JSON parse, reject query strings, and forward only trusted headers through `fetchAifansApi`. Create parses its success body; send requires `text/event-stream`, forwards cancellation, enforces a bounded stream, and passes through only AIFANS stream events rather than provider events.

- [ ] **Step 5: Remove the legacy IP-id proxy**

Delete the old route only after all new proxy tests pass and `rg '/api/chat|ChatMessageInputSchema' apps/web/src` shows no runtime consumers.

- [ ] **Step 6: Run Web proxy tests and typecheck**

Run: `pnpm --dir apps/web test src/lib/chat-api.test.ts 'src/app/api/conversations/**/*.test.tsx' && pnpm --dir apps/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/chat-api.ts apps/web/src/lib/chat-api.test.ts apps/web/src/app/api/conversations apps/web/src/app/api/chat
git commit -m "feat(web): proxy persistent conversation commands"
```

### Task 7: Build Threads-style Messages list/detail UI

**Files:**
- Modify: `apps/web/src/app/[locale]/messages/page.tsx`
- Create: `apps/web/src/app/[locale]/messages/[conversationId]/page.tsx`
- Create: `apps/web/src/components/chat/MessagesWorkspace.tsx`
- Create: `apps/web/src/components/chat/ConversationList.tsx`
- Create: `apps/web/src/components/chat/ConversationDetail.tsx`
- Create: `apps/web/src/components/chat/ChatComposer.tsx`
- Create: `apps/web/src/components/chat/MessagesWorkspace.module.css`
- Delete: `apps/web/src/components/chat/ChatPanel.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh-CN.json`
- Create/Modify: `apps/web/src/components/chat/*.test.tsx`
- Create/Modify: `apps/web/src/app/[locale]/messages/*.test.tsx`

- [ ] **Step 1: Write failing page and component tests**

Assert: both routes call `requireAuthenticatedPage` before chat reads; anonymous redirects through the centralized guard; unavailable auth mounts no data component; desktop renders a conversation list plus empty/selected detail pane; mobile detail has a localized Back link; selected links use `aria-current="page"`; no arbitrary UUID input or provider id is rendered; real empty/error/pagination states render; composer disables honestly when `sendEnabled` is false; Enter sends, Shift+Enter inserts a newline; an optimistic human message is reconciled using `requestId`; streamed assistant deltas render progressively; `assistant_complete` replaces the temporary row with the persisted AIFANS message; failed sends stay visible with failed state and can be retried with the same request id.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --dir apps/web test 'src/app/[locale]/messages/**/*.test.tsx' 'src/components/chat/*.test.tsx'`

Expected: FAIL against the current UUID-entry `ChatPanel`.

- [ ] **Step 3: Implement protected server pages**

The list route fetches conversations only after authenticated access. The detail route validates the AIFANS conversation UUID, fetches both list and owner-scoped history, and returns `notFound()` for an inaccessible id. Both pass only parsed provider-neutral data to UI components.

- [ ] **Step 4: Implement accessible list/detail components**

Use semantic links for conversation navigation, `aria-current="page"` for the selected row, ordered history, `aria-live="polite"` only for new message status, and a real localized Back link on mobile. Reuse existing avatar and empty/error primitives; do not create data placeholders.

- [ ] **Step 5: Implement responsive CSS**

At `min-width:700px`, render a fixed `minmax(280px, 360px)` list column and flexible detail column within MessagesShell; the global shell already forces the compact rail. Below `700px`, `/messages` shows only the list and `/messages/:id` shows only detail with Back. Use fluid sizes, existing shell variables, no fixed viewport screenshots, and no horizontal overflow at 375/430/699/700/768/1024/1440.

- [ ] **Step 6: Replace chat localization in lockstep**

Add the same keys to `en.json` and `zh-CN.json` for list title, no conversations, select conversation, Back, message failed/retry, provider unavailable, send, sending, and timestamps. Remove UUID target/conversation-id/demo-session keys only after `rg` proves no consumers.

- [ ] **Step 7: Run component/page tests and typecheck**

Run: `pnpm --dir apps/web test 'src/app/[locale]/messages/**/*.test.tsx' 'src/components/chat/*.test.tsx' && pnpm --dir apps/web typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/[locale]/messages apps/web/src/components/chat apps/web/messages/en.json apps/web/messages/zh-CN.json
git commit -m "feat(messages): add responsive persistent workspace"
```

### Task 8: Add a real Chat entry from public AI/IP profiles

**Files:**
- Create: `apps/web/src/components/chat/StartChatButton.tsx`
- Create: `apps/web/src/components/chat/StartChatButton.test.tsx`
- Modify: `apps/web/src/components/social/PublicProfileContent.tsx`
- Modify: `apps/web/src/components/social/PublicProfileContent.test.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh-CN.json`

- [ ] **Step 1: Write failing entry-point tests**

Assert guest Chat links to full-page sign-in with a safe `next` back to the AI/IP profile; authenticated Chat posts only `{ipProfileId}` to the same-origin proxy and navigates to `/{locale}/messages/{conversationId}`; pending/error states are localized; no chat affordance appears for unavailable/non-public profiles.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --dir apps/web test src/components/chat/StartChatButton.test.tsx src/components/social/PublicProfileContent.test.tsx`

Expected: FAIL because `StartChatButton` is absent.

- [ ] **Step 3: Implement the client command**

The component receives only `ipProfileId`, `locale`, `authenticated`, and labels. It does not accept or render provider ids. Disable duplicate submits, validate `ChatConversationSummarySchema`, capture existing analytics conventions, and navigate only after a valid response.

- [ ] **Step 4: Place the entry beside Follow**

Use the existing compact action area. Guest Chat goes through Auth; authenticated Chat creates or reuses the one owner/IP conversation. Keep Follow and Chat keyboard reachable and visually stable at 375px.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --dir apps/web test src/components/chat/StartChatButton.test.tsx src/components/social/PublicProfileContent.test.tsx && pnpm --dir apps/web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/StartChatButton.tsx apps/web/src/components/chat/StartChatButton.test.tsx apps/web/src/components/social/PublicProfileContent.tsx apps/web/src/components/social/PublicProfileContent.test.tsx apps/web/messages/en.json apps/web/messages/zh-CN.json
git commit -m "feat(profile): connect AI profiles to messages"
```

### Task 9: Full verification and real-browser matrix

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run package tests**

```bash
pnpm --dir packages/contracts test
pnpm --dir packages/ui test
pnpm --dir packages/db test
pnpm --dir apps/api test
pnpm --dir apps/web test
```

Expected: all non-environment-gated tests pass; DB integration skips are explicitly counted when credentials are absent.

- [ ] **Step 2: Run typecheck and production build**

```bash
pnpm typecheck
WEB_API_RATE_LIMIT_SIGNING_SECRET=local_validation_secret_32_chars__ pnpm --dir apps/web build
git diff --check
```

Expected: exit 0 for every command.

- [ ] **Step 3: Run real-browser responsive checks**

Verify `/en/messages`, `/zh-CN/messages`, and a real conversation detail at 375, 430, 699, 700, 768, 1024, 1149, 1150, and 1440 in light/dark. Confirm compact left rail on every non-mobile Messages width, list-only/detail-only mobile routing, Back behavior, no overflow, keyboard focus, empty/error/provider-disabled states, and no provider id or arbitrary UUID field in the DOM.

- [ ] **Step 4: Verify security behavior**

Confirm guest access goes to full-page Auth with a safe return path; owner A receives 404 for owner B's conversation; list/history still work with Dify env removed; sending returns the localized disabled state; same-origin and size-limit proxy tests remain green; no secrets appear in `git diff`.

- [ ] **Step 5: Request code review and fix all Critical/Important findings**

Review the complete diff against the design spec, RLS ownership, retry/idempotency, provider-id privacy, responsive layout, and localization parity. Re-run affected tests after every fix.

- [ ] **Step 6: Create the stable batch commit**

```bash
git add -A
git commit -m "feat(messages): persist AI conversations end to end"
```

Do not push to `main` until the complete ordinary-user rebuild verification gate is satisfied. Push the verified feature branch to Preview when GitHub authentication is available.
