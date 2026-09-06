# Unified Chat Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make newly created IP chats appear immediately in the inbox and render IP and human messages with the same identity, timestamp, and read-state structure.

**Architecture:** Reuse the existing account-scoped TanStack Query inbox cache and the established browser custom-event pattern for optimistic IP conversation updates. Render IP messages through the same avatar/content/meta layout contract already used by human chat; the IP read cursor is treated as the latest user message sequence so outgoing user messages display as read after server confirmation.

**Tech Stack:** Next.js client components, React, TanStack Query, Vitest, CSS Modules.

---

### Task 1: Synchronize new IP conversations into the inbox cache

**Files:**
- Modify: `apps/web/src/components/chat/StartChatButton.tsx`
- Modify: `apps/web/src/components/chat/CachedMessagesWorkspace.tsx`
- Modify: `apps/web/src/components/chat/ConversationList.tsx`
- Test: `apps/web/src/components/chat/StartChatButton.test.tsx`
- Test: `apps/web/src/components/chat/CachedMessagesWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type: 'aifans:ip-conversation-created'}))
expect(screen.getByText('Luma')).toBeVisible()
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm -C apps/web exec vitest run src/components/chat/StartChatButton.test.tsx src/components/chat/CachedMessagesWorkspace.test.tsx`

Expected: FAIL because a created conversation is neither published nor inserted into the AI inbox cache.

- [ ] **Step 3: Implement the cache handoff**

```tsx
window.dispatchEvent(new CustomEvent('aifans:ip-conversation-created', {detail: parsed.data}))
queryClient.setQueriesData<AiInboxResult>({queryKey: ['ai-chat', scope, locale, 'inbox']}, cached => {
  if (cached?.status !== 'ok') return cached
  const items = [event.detail, ...cached.data.items.filter(item => item.id !== event.detail.id)]
  return {...cached, data: {...cached.data, items}}
})
```

Keep rows with `lastMessage: null` in `ConversationList` so a created conversation remains visible before the first message.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm -C apps/web exec vitest run src/components/chat/StartChatButton.test.tsx src/components/chat/CachedMessagesWorkspace.test.tsx`

Expected: PASS.

### Task 2: Use the shared message-row contract for IP conversations

**Files:**
- Modify: `apps/web/src/components/chat/ConversationDetail.tsx`
- Modify: `apps/web/src/components/chat/AiGenerationSnapshot.tsx`
- Modify: `apps/web/src/components/chat/MessagesWorkspace.module.css`
- Test: `apps/web/src/components/chat/ConversationDetail.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
expect(screen.getAllByText('Luma')).toHaveLength(2)
expect(screen.getByRole('img', {name: 'Read'})).toHaveTextContent('✓✓')
expect(screen.getByText('First history').closest('li')).toHaveClass(styles.ipMessage)
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm -C apps/web exec vitest run src/components/chat/ConversationDetail.test.tsx`

Expected: FAIL because IP rows lack both avatars, metadata, and an immediate read marker.

- [ ] **Step 3: Implement the shared row layout**

```tsx
<li className={outgoing ? styles.humanMessage : styles.assistantMessage}>
  <div className={styles.messageAvatar}>{avatar}</div>
  <div className={styles.messageContent}>
    <p>{message.body}</p>
    <div className={styles.messageMeta}><time>{messageTime(message.createdAt)}</time>{outgoing ? <span aria-label={readLabel}>✓✓</span> : null}</div>
  </div>
</li>
```

Use `Avatar` for the IP and the currently authenticated account. Keep the existing single-column override only for generation snapshots, which have no sender identity.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm -C apps/web exec vitest run src/components/chat/ConversationDetail.test.tsx`

Expected: PASS.

### Task 3: Verify the integrated chat surface and deploy

**Files:**
- Modify: only files from Tasks 1 and 2.

- [ ] **Step 1: Run complete chat regression**

Run: `pnpm -C apps/web exec vitest run src/components/chat && pnpm -C apps/web typecheck`

Expected: all chat tests and TypeScript check pass.

- [ ] **Step 2: Run production build**

Run: `WEB_API_RATE_LIMIT_SIGNING_SECRET='local_validation_secret_32_chars__' AIFANS_NEXT_DIST_DIR=.next-unified-chat-validation pnpm -C apps/web build`

Expected: optimized build completes and prerender shell verification passes.

- [ ] **Step 3: Commit and push only relevant files**

```bash
git add apps/web/src/components/chat/StartChatButton.tsx apps/web/src/components/chat/CachedMessagesWorkspace.tsx apps/web/src/components/chat/ConversationList.tsx apps/web/src/components/chat/ConversationDetail.tsx apps/web/src/components/chat/AiGenerationSnapshot.tsx apps/web/src/components/chat/MessagesWorkspace.module.css apps/web/src/components/chat/StartChatButton.test.tsx apps/web/src/components/chat/CachedMessagesWorkspace.test.tsx apps/web/src/components/chat/ConversationDetail.test.tsx
git commit -m 'feat(web): unify chat inbox and message rows'
git push origin codex/ux-slice-0-1
```

- [ ] **Step 4: Verify Vercel deployment**

Run: `pnpm dlx vercel@59.11.7 inspect <deployment-url> --scope ruihao-luos-projects`

Expected: status `Ready` and build logs identify the pushed commit.
