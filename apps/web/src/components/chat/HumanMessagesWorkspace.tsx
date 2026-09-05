"use client";

import {
  HumanInboxPageSchema,
  type HumanInboxPage,
  type HumanMessage,
} from "@aifans/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { humanRequest, realtimeEndpoint } from "../../lib/human-chat-client";
import {
  createRealtimeTransport,
  type RealtimeState,
} from "../../lib/realtime-transport";
import { authHref } from "../../lib/auth/return-to";
import { ConversationList } from "./ConversationList";
import { ConversationDetail } from "./ConversationDetail";
import { HumanConversationDetail } from "./HumanConversationDetail";
import { InboxWorkspaceFrame } from "./InboxWorkspaceFrame";
import { MessagesSectionHeader } from "./MessagesSectionHeader";
import { mergeHumanInboxEvent } from "./human-chat-cache";
import type { MessagesWorkspaceProps } from "./MessagesWorkspace";
import styles from "./MessagesWorkspace.module.css";

export function HumanMessagesWorkspace({
  selfProfileId,
  items,
  labels,
  locale,
  selectedId,
  selectedHumanId,
  history,
  initialCursor,
  nextCursor,
  listUnavailable = false,
  detailUnavailable = false,
}: MessagesWorkspaceProps & { selfProfileId: string }) {
  const queryClient = useQueryClient();
  const inboxKey = useMemo(
    () => ["human-chat", selfProfileId, "inbox"] as const,
    [selfProfileId],
  );
  const cachedInbox = queryClient.getQueryData<{
    items: HumanInboxPage["items"];
    cursor: string | null;
  }>(inboxKey);
  const [inbox, setInbox] = useState<HumanInboxPage["items"]>(
    () => cachedInbox?.items ?? [],
  );
  const [humanCursor, setHumanCursor] = useState<string | null>(
    () => cachedInbox?.cursor ?? null,
  );
  const [loading, setLoading] = useState(() => !cachedInbox?.items.length);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [aiRevision, setAiRevision] = useState(0);
  const [connection, setConnection] = useState<RealtimeState | "unconfigured">(
    "unconfigured",
  );
  const connectionRef = useRef<RealtimeState | "unconfigured">("unconfigured");
  const [readCursors, setReadCursors] = useState<Record<string, number>>({});
  const [realtimeMessage, setRealtimeMessage] = useState<HumanMessage | null>(
    null,
  );
  const [transient, setTransient] = useState<
    Record<string, { typing: number; online: number }>
  >({});
  const transientTimes = useRef(new Map<string, number>());
  const [revoked, setRevoked] = useState<Set<string>>(new Set());
  const owner = useRef<AbortController | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const transport = useRef<ReturnType<typeof createRealtimeTransport> | null>(
    null,
  );
  const currentInbox = useRef(inbox);
  const deletedCutoffs = useRef(new Map<string, number>());
  useEffect(() => {
    function onDeleted(event: Event) {
      const detail = (event as CustomEvent<{kind:string;conversationId:string;deletedAt?:string}>).detail;
      if (detail?.kind !== 'HUMAN') return;
      deletedCutoffs.current.set(detail.conversationId, Date.parse(detail.deletedAt ?? new Date().toISOString()));
      activeRequest.current?.abort();
      currentInbox.current = currentInbox.current.filter(item => item.conversation.id !== detail.conversationId);
      setInbox(currentInbox.current);
      setRealtimeMessage(null);
      setRevision(value => value + 1);
    }
    window.addEventListener('aifans:conversation-deleted', onDeleted);
    return () => window.removeEventListener('aifans:conversation-deleted', onDeleted);
  }, [selfProfileId]);
  const currentSelected = useRef(selectedHumanId);
  const currentAiSelected = useRef(selectedId),
    aiSubscription = useRef<string | null>(null);
  currentAiSelected.current = selectedHumanId ? undefined : selectedId;
  const subscriptions = useRef(new Set<string>());
  currentSelected.current = selectedHumanId;
  const endpoint = realtimeEndpoint(
    process.env.NEXT_PUBLIC_REALTIME_URL,
    selfProfileId,
  );
  useEffect(() => {
    queryClient.setQueryData(inboxKey, { items: inbox, cursor: humanCursor });
  }, [humanCursor, inbox, inboxKey, queryClient]);
  const syncSubscriptions = useCallback(() => {
    const selectedAi = currentAiSelected.current;
    if (aiSubscription.current && aiSubscription.current !== selectedAi) {
      transport.current?.send({
        v: 1,
        type: "unsubscribe_ai",
        conversationId: aiSubscription.current,
      });
      aiSubscription.current = null;
    }
    if (
      selectedAi &&
      aiSubscription.current !== selectedAi &&
      transport.current?.send({
        v: 1,
        type: "subscribe_ai",
        conversationId: selectedAi,
      })
    )
      aiSubscription.current = selectedAi;
    const desired = new Set(
      currentInbox.current.map((item) => item.conversation.id),
    );
    if (currentSelected.current) desired.add(currentSelected.current);
    for (const id of subscriptions.current)
      if (!desired.has(id)) {
        transport.current?.send({
          v: 1,
          type: "unsubscribe",
          conversationId: id,
        });
        subscriptions.current.delete(id);
      }
    for (const id of desired)
      if (
        !subscriptions.current.has(id) &&
        transport.current?.send({ v: 1, type: "subscribe", conversationId: id })
      )
        subscriptions.current.add(id);
  }, []);
  const refresh = useCallback(
    async (cursor?: string) => {
      const lifecycle = owner.current;
      if (!lifecycle || lifecycle.signal.aborted) return;
      activeRequest.current?.abort();
      const request = new AbortController();
      activeRequest.current = request;
      const stop = () => request.abort();
      lifecycle.signal.addEventListener("abort", stop, { once: true });
      // A background reconciliation must never replace an already usable
      // inbox with a visible loading state.
      setLoading(currentInbox.current.length === 0);
      try {
        const page = HumanInboxPageSchema.parse(
          await humanRequest(
            `conversations?${new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) })}`,
            request.signal,
          ),
        );
        // Refresh every previously loaded page, not just page one; selected older
        // conversations and unread counters must not disappear on reconnect.
        if (!cursor) {
          const targetCount = currentInbox.current.length;
          const seenCursors = new Set<string>();
          for (
            let count = 1;
            count < 20 &&
            page.nextCursor &&
            (page.items.length < targetCount ||
              (currentSelected.current &&
                !page.items.some(
                  (item) => item.conversation.id === currentSelected.current,
                )));
            count++
          ) {
            if (seenCursors.has(page.nextCursor))
              throw Error("Invalid inbox cursor cycle");
            seenCursors.add(page.nextCursor);
            const next = HumanInboxPageSchema.parse(
              await humanRequest(
                `conversations?${new URLSearchParams({ limit: "100", cursor: page.nextCursor })}`,
                request.signal,
              ),
            );
            if (request.signal.aborted || lifecycle.signal.aborted) return;
            page.items.push(...next.items);
            page.nextCursor = next.nextCursor;
          }
        }
        if (request.signal.aborted || lifecycle.signal.aborted) return;
        if (
          page.items.some(
            (item) =>
              !item.conversation.participants.some(
                (person) => person.id === selfProfileId,
              ),
          )
        )
          throw Error();
        const merged = cursor
          ? [
              ...new Map(
                [...currentInbox.current, ...page.items].map((item) => [
                  item.conversation.id,
                  item,
                ]),
              ).values(),
            ]
          : page.items;
        currentInbox.current = merged;
        setInbox(merged);
        setHumanCursor(page.nextCursor);
        setError(false);
        syncSubscriptions();
      } catch (cause) {
        if (!request.signal.aborted && !lifecycle.signal.aborted) {
          if ((cause as Error).message === "UNAUTHORIZED")
            globalThis.location.assign(
              authHref(
                locale,
                `/${locale}/messages${currentSelected.current ? `?humanConversation=${currentSelected.current}` : ""}`,
              ),
            );
          else setError(true);
        }
      } finally {
        lifecycle.signal.removeEventListener("abort", stop);
        if (!request.signal.aborted && !lifecycle.signal.aborted)
          setLoading(false);
      }
    },
    [locale, selfProfileId, syncSubscriptions],
  );
  const changed = useCallback(() => {
    void refresh();
  }, [refresh]);
  const revokeConversation = useCallback((id: string) => {
    setRevoked((current) => new Set([...current, id]));
    currentInbox.current = currentInbox.current.filter(
      (item) => item.conversation.id !== id,
    );
    setInbox(currentInbox.current);
    transport.current?.send({ v: 1, type: "unsubscribe", conversationId: id });
    subscriptions.current.delete(id);
  }, []);
  useEffect(() => {
    const lifecycle = new AbortController();
    owner.current = lifecycle;
    void refresh();
    if (endpoint) {
      const realtime = createRealtimeTransport({
        endpoint,
        getTicket: async (signal) => {
          const response = await fetch("/api/realtime/ticket", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
            cache: "no-store",
            signal,
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw Error("Ticket unavailable");
          }
          const value: unknown = await response.json();
          if (
            !value ||
            typeof value !== "object" ||
            !("ticket" in value) ||
            typeof value.ticket !== "string"
          )
            throw Error("Invalid ticket");
          return value.ticket;
        },
        onAuthenticated: () => {
          aiSubscription.current = null;
          setAiRevision((value) => value + 1);
          subscriptions.current.clear();
          setReadCursors({});
          syncSubscriptions();
          changed();
          // A reconnect can have missed messages. Reconcile only the open
          // conversation; its retained history never returns to a loader.
          setRevision((value) => value + 1);
        },
        onStateChange: (state) => {
          connectionRef.current = state;
          if (!lifecycle.signal.aborted) setConnection(state);
          if (state !== "ready") setTransient({});
        },
        onAiEvent: (event) => {
          if (
            !lifecycle.signal.aborted &&
            event.conversationId === currentAiSelected.current
          )
            setAiRevision((value) => value + 1);
        },
        onEvent: (event) => {
          if (lifecycle.signal.aborted) return;
          if (event.type === "access_revoked") {
            setTransient((current) => {
              const next = { ...current };
              delete next[event.conversationId];
              return next;
            });
            setRevoked(
              (current) => new Set([...current, event.conversationId]),
            );
            currentInbox.current = currentInbox.current.filter(
              (item) => item.conversation.id !== event.conversationId,
            );
            setInbox(currentInbox.current);
            return;
          }
          if (event.type === "typing" || event.type === "presence") {
            const peer = currentInbox.current
              .find((item) => item.conversation.id === event.conversationId)
              ?.conversation.participants.find(
                (person) => person.id !== selfProfileId,
              );
            if (peer?.id !== event.profileId) return;
            const now = Date.now(),
              at = Date.parse(event.occurredAt),
              key = `${event.conversationId}:${event.type}`,
              ttl = event.type === "typing" ? 5000 : 45000;
            if (
              !Number.isFinite(at) ||
              at > now + 5000 ||
              at + ttl <= now ||
              at < (transientTimes.current.get(key) ?? 0)
            )
              return;
            transientTimes.current.set(key, at);
            setTransient((current) => {
              const previous = current[event.conversationId] ?? {
                typing: 0,
                online: 0,
              };
              return {
                ...current,
                [event.conversationId]:
                  event.type === "typing"
                    ? {
                        ...previous,
                        typing: event.isTyping ? Math.min(at, now) + 5000 : 0,
                      }
                    : {
                        typing: event.status === "online" ? previous.typing : 0,
                        online:
                          event.status === "online"
                            ? Math.min(at, now) + 45000
                            : 0,
                      },
              };
            });
          }
          if (event.type === "read" && event.profileId !== selfProfileId)
            setReadCursors((current) => ({
              ...current,
              [event.conversationId]: Math.max(
                current[event.conversationId] ?? 0,
                event.lastReadSequence,
              ),
            }));
          if (event.type === "message") {
            if (Date.parse(event.message.createdAt) <= (deletedCutoffs.current.get(event.message.conversationId) ?? 0)) return;
            currentInbox.current = mergeHumanInboxEvent(
              currentInbox.current,
              event.message,
            );
            setInbox(currentInbox.current);
            setRealtimeMessage(event.message);
          }
        },
      });
      transport.current = realtime;
      void realtime.connect();
    }
    const visible = () => {
      if (document.visibilityState === "visible") {
        changed();
        setRevision((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    // Authoritative polling also discovers newly created conversations not yet subscribed.
    const timer = setInterval(() => {
      if (connectionRef.current !== "ready") visible();
    }, 15_000);
    return () => {
      lifecycle.abort();
      activeRequest.current?.abort();
      transport.current?.dispose();
      transport.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, [endpoint, refresh, changed, selfProfileId, syncSubscriptions]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setTransient((current) => {
          const now = Date.now();
          let change = false;
          const next = { ...current };
          for (const [id, value] of Object.entries(next)) {
            const typing = value.typing > now ? value.typing : 0,
              online = value.online > now ? value.online : 0;
            if (typing !== value.typing || online !== value.online) {
              change = true;
              next[id] = { typing, online };
            }
          }
          return change ? next : current;
        }),
      500,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    syncSubscriptions();
  }, [selectedHumanId, selectedId, syncSubscriptions]);
  const selected = inbox.find(
    (item) => item.conversation.id === selectedHumanId,
  );
  const mobileHeader = (
    <div className={styles.mobileDetailSectionHeader}>
      <MessagesSectionHeader active="chat" labels={labels} locale={locale} />
    </div>
  );
  const humanFooter = loading ? (
    <p className={styles.detailNotice} role="status">
      {labels.loadingMore}
    </p>
  ) : error ? (
    <p className={styles.detailNotice} role="alert">
      {labels.unavailable}
      <button className={styles.older} onClick={() => void refresh()}>
        {labels.retry}
      </button>
    </p>
  ) : humanCursor ? (
    <button className={styles.more} onClick={() => void refresh(humanCursor)}>
      {labels.loadMore}
    </button>
  ) : null;
  const detail = selectedHumanId ? (
    selected && !revoked.has(selectedHumanId) ? (
      <HumanConversationDetail
        conversation={selected.conversation}
        selfProfileId={selfProfileId}
        labels={labels}
        locale={locale}
        revision={revision}
        realtimeMessage={realtimeMessage}
        onChanged={changed}
        onMessageSent={(message) => {
          currentInbox.current = mergeHumanInboxEvent(currentInbox.current, message);
          setInbox(currentInbox.current);
        }}
        onAccessRevoked={revokeConversation}
        peerReadSequence={readCursors[selectedHumanId]}
        peerTyping={Boolean(transient[selectedHumanId]?.typing)}
        peerOnline={Boolean(transient[selectedHumanId]?.online)}
        onTyping={(isTyping) => {
          transport.current?.send({
            v: 1,
            type: "typing",
            conversationId: selectedHumanId,
            isTyping,
          });
        }}
        sectionHeader={mobileHeader}
      />
    ) : (
      <section className={styles.detailPane}>
        {mobileHeader}
        <p className={styles.detailNotice} role="status">
          {loading ? labels.loadingMore : labels.unavailable}
        </p>
        {humanCursor ? (
          <button
            className={styles.more}
            onClick={() => void refresh(humanCursor)}
          >
            {labels.loadMore}
          </button>
        ) : null}
      </section>
    )
  ) : selectedId ? (
    <ConversationDetail
      revision={aiRevision}
      realtimeReady={connection === "ready"}
      history={history}
      labels={labels}
      listCursor={initialCursor}
      locale={locale}
      sectionHeader={mobileHeader}
      unavailable={detailUnavailable}
    />
  ) : (
    <section className={styles.emptyPane}>
      <div>
        <h2>{labels.selectConversation}</h2>
      </div>
    </section>
  );
  return (
    <InboxWorkspaceFrame
      selected={Boolean(selectedId || selectedHumanId)}
      detail={detail}
      list={
        <ConversationList
          initialCursor={initialCursor}
          items={items}
          labels={labels}
          locale={locale}
          nextCursor={nextCursor}
          selectedId={selectedId}
          selectedHumanId={selectedHumanId}
          humanItems={inbox.filter(
            (item) => !revoked.has(item.conversation.id),
          )}
          selfProfileId={selfProfileId}
          humanLoading={loading || error}
          unavailable={listUnavailable && error}
          humanFooter={
            <>
              {listUnavailable && !error ? (
                <p className={styles.detailNotice} role="alert">
                  {labels.unavailable}
                </p>
              ) : null}
              {humanFooter}
            </>
          }
        />
      }
    />
  );
}
