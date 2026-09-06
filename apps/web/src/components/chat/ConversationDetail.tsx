"use client";

import {
  ChatHistoryPageSchema,
  type ChatHistoryPage,
  type ChatMessage,
} from "@aifans/contracts";
import Link from "next/link";
import { QueryClientContext } from "@tanstack/react-query";
import type { AiInboxResult } from "./ai-inbox-query";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AiGenerationSnapshot } from "./AiGenerationSnapshot";
import { mergeAiHistory } from "../../lib/ai-history";
import type { Locale } from "../../i18n/config";
import { authHref } from "../../lib/auth/return-to";
import { ChatComposer, type ChatComposerLabels } from "./ChatComposer";
import { Avatar } from "../account/Avatar";
import { useOptionalCurrentAccount } from "../account/CurrentAccountProvider";
import styles from "./MessagesWorkspace.module.css";

export type ConversationDetailLabels = ChatComposerLabels & {
  back: string;
  emptyHistory: string;
  loadEarlierMessages: string;
  unavailable: string;
};

function orderedUnique(messages: ChatMessage[]) {
  return [
    ...new Map(messages.map((message) => [message.id, message])).values(),
  ].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function messageTime(createdAt: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

type ConversationDetailProps = {
  history?: ChatHistoryPage | undefined;
  labels: ConversationDetailLabels;
  listCursor?: string | undefined;
  locale: Locale;
  sectionHeader?: ReactNode;
  unavailable?: boolean | undefined;
  revision?: number;
  realtimeReady?: boolean;
  onConversationRead?: ((conversation: ChatHistoryPage['conversation']) => void) | undefined;
};

export function ConversationDetail(props: ConversationDetailProps) {
  return (
    <ConversationDetailContent
      key={props.history?.conversation.id ?? "unavailable"}
      {...props}
    />
  );
}

export function ConversationDetailSurface({
  name,
  username,
  backHref,
  backLabel,
  avatar,
  sectionHeader,
  children,
  status,
}: {
  name: string;
  username: string;
  backHref: string;
  backLabel: string;
  avatar?: ReactNode;
  sectionHeader?: ReactNode;
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <section aria-label={name} className={styles.detailPane}>
      {sectionHeader}
      <header className={styles.detailHeader}>
        <Link aria-label={backLabel} className={styles.back} href={backHref}>
          <span aria-hidden="true">←</span>
        </Link>
        <div className={styles.detailIdentity}>
          {avatar ?? (
            <span aria-hidden="true" className={styles.avatar}>
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h2>{name}</h2>
            {status ? <p>{status}</p> : null}
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

function ConversationDetailContent({
  history,
  labels,
  listCursor,
  locale,
  sectionHeader,
  unavailable = false,
  revision = 0,
  realtimeReady = false,
  onConversationRead,
}: ConversationDetailProps) {
  const account = useOptionalCurrentAccount()?.account;
  const queryClient = useContext(QueryClientContext);
  const [items, setItems] = useState<ChatMessage[]>(history?.items ?? []);
  const [nextCursor, setNextCursor] = useState(history?.nextCursor ?? null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState(false);
  const conversationId = useRef(history?.conversation.id);
  const loadingRef = useRef(false);
  const mounted = useRef(true);
  const earlierOperation = useRef(0);
  const earlierController = useRef<AbortController | null>(null);
  const refreshController = useRef<AbortController | null>(null),
    streaming = useRef(false),
    latestItems = useRef(items);
  latestItems.current = items;
  const refresh = useCallback(async () => {
    const id = history?.conversation.id;
    if (
      !id ||
      !mounted.current ||
      streaming.current ||
      document.visibilityState !== "visible"
    )
      return;
    refreshController.current?.abort();
    const owner = new AbortController();
    refreshController.current = owner;
    try {
      const response = await fetch(`/api/conversations/${id}/messages`, {
        method: "GET",
        cache: "no-store",
        signal: owner.signal,
      });
      if (owner.signal.aborted) return;
      if (response.status === 401) {
        await response.body?.cancel();
        setItems([]);
        globalThis.location.assign(
          authHref(locale, `/${locale}/messages/${id}`),
        );
        return;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw Error();
      }
      const page = ChatHistoryPageSchema.parse(await response.json());
      if (owner.signal.aborted || streaming.current) return;
      if (page.conversation.id !== id) throw Error();
      setItems((current) => mergeAiHistory(current, page.items));
      setEarlierError(false);
    } catch {
      if (!owner.signal.aborted) setEarlierError(true);
    }
  }, [history?.conversation.id, locale]);
  useEffect(() => {
    const conversation = history?.conversation
    if (!conversation) return
    const accepted = navigator.sendBeacon?.(
      `/api/conversations/${conversation.id}/read`,
      new Blob([], {type: 'application/json'}),
    )
    if (accepted) onConversationRead?.({...conversation, unreadCount: 0})
  }, [history?.conversation, onConversationRead])
  useEffect(() => {
    if (revision > 0) void refresh();
  }, [revision, refresh]);
  useEffect(() => {
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = setInterval(() => {
      if (
        !realtimeReady &&
        latestItems.current.some(
          (message) =>
            message.generation &&
            ["generating", "partial"].includes(message.generation.state),
        )
      )
        void refresh();
    }, 15000);
    return () => {
      refreshController.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh, realtimeReady]);
  useEffect(() => {
    const nextConversationId = history?.conversation.id;
    const changedConversation = conversationId.current !== nextConversationId;
    if (changedConversation) {
      earlierOperation.current += 1;
      earlierController.current?.abort();
      earlierController.current = null;
      loadingRef.current = false;
    }
    conversationId.current = nextConversationId;
    if (!history) {
      setItems([]);
      setNextCursor(null);
      setLoadingEarlier(false);
      setEarlierError(false);
      return;
    }
    if (changedConversation) {
      setItems(orderedUnique(history.items));
      setNextCursor(history.nextCursor);
      setEarlierError(false);
    } else if (!streaming.current)
      setItems((current) => mergeAiHistory(current, history.items));
  }, [history]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      earlierOperation.current += 1;
      earlierController.current?.abort();
      earlierController.current = null;
      loadingRef.current = false;
    };
  }, []);
  async function cancelBody(response: Response) {
    try {
      await response.body?.cancel();
    } catch {}
  }
  async function loadEarlier() {
    const cursor = nextCursor;
    if (!history || !cursor || loadingRef.current) return;
    const id = earlierOperation.current + 1;
    const targetConversationId = history.conversation.id;
    earlierOperation.current = id;
    loadingRef.current = true;
    setLoadingEarlier(true);
    setEarlierError(false);
    const request = new AbortController();
    earlierController.current = request;
    const current = () =>
      mounted.current &&
      earlierOperation.current === id &&
      conversationId.current === targetConversationId &&
      !request.signal.aborted;
    const ownsRequest = () =>
      earlierOperation.current === id && earlierController.current === request;
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(targetConversationId)}/messages?${new URLSearchParams({ cursor })}`,
        { method: "GET", signal: request.signal },
      );
      if (!current()) {
        await cancelBody(response);
        return;
      }
      if (response.status === 401) {
        await cancelBody(response);
        if (current()) {
          const returnQuery = new URLSearchParams();
          if (listCursor) returnQuery.set("listCursor", listCursor);
          returnQuery.set("cursor", cursor);
          globalThis.location.assign(
            authHref(
              locale,
              `/${locale}/messages/${targetConversationId}?${returnQuery}`,
            ),
          );
        }
        return;
      }
      if (!response.ok) {
        await cancelBody(response);
        if (!current()) return;
        throw Error("unavailable");
      }
      const value: unknown = await response.json();
      if (!current()) return;
      const parsed = ChatHistoryPageSchema.safeParse(value);
      if (
        !parsed.success ||
        parsed.data.conversation.id !== targetConversationId
      )
        throw Error("unavailable");
      setItems((current) => orderedUnique([...parsed.data.items, ...current]));
      setNextCursor(parsed.data.nextCursor);
    } catch (error) {
      if (current() && (error as Error).name !== "AbortError")
        setEarlierError(true);
    } finally {
      if (!ownsRequest()) return;
      loadingRef.current = false;
      earlierController.current = null;
      if (mounted.current) setLoadingEarlier(false);
    }
  }
  if (unavailable || !history)
    return (
      <section className={styles.detailPane}>
        {sectionHeader}
        <p className={styles.detailNotice} role="alert">
          {labels.unavailable}
        </p>
      </section>
    );
  const emptyText = locale === "zh-CN"
    ? { description: "还没有消息，向对方打个招呼吧。", profile: "查看主页" }
    : { description: "No messages yet. Say hello and start the conversation.", profile: "View profile" };
  return (
    <ConversationDetailSurface
      name={history.conversation.ipProfile.displayName}
      username={history.conversation.ipProfile.username}
      backLabel={labels.back}
      backHref={`/${locale}/messages${listCursor ? `?${new URLSearchParams({ cursor: listCursor })}` : ""}`}
      sectionHeader={sectionHeader}
      avatar={<Link aria-label={`Profile: ${history.conversation.ipProfile.displayName}`} href={`/${locale}/profiles/${history.conversation.ipProfile.id}`}><Avatar avatarUrl={null} decorative displayName={history.conversation.ipProfile.displayName} identityId={history.conversation.ipProfile.id} kind="ip" size="small" /></Link>}
    >
      <div className={styles.messageArea}>
        {nextCursor ? (
          <button
            className={styles.older}
            disabled={loadingEarlier}
            onClick={() => void loadEarlier()}
            type="button"
          >
            {labels.loadEarlierMessages}
          </button>
        ) : null}
        {earlierError ? (
          <p className={styles.detailNotice} role="alert">
            {labels.unavailable}
          </p>
        ) : null}
        {items.length === 0 ? (
          <div className={styles.emptyConversation}>
            <Avatar
              avatarUrl={null}
              decorative
              displayName={history.conversation.ipProfile.displayName}
              identityId={history.conversation.ipProfile.id}
              kind="ip"
              size="large"
            />
            <h3>{history.conversation.ipProfile.displayName}</h3>
            <p>{emptyText.description}</p>
            <Link href={`/${locale}/profiles/${history.conversation.ipProfile.id}`}>
              {emptyText.profile}
            </Link>
          </div>
        ) : (
          <ol className={styles.messageList}>
            {items.map((message) => (
              <Fragment key={message.id}>
                <li
                  aria-label={
                    message.deliveryState === "failed" && !message.generation
                      ? labels.messageFailed
                      : undefined
                  }
                  className={`${message.role === "human" ? styles.humanMessage : styles.assistantMessage} ${styles.ipMessage}`}
                >
                  <div className={styles.messageAvatar} aria-hidden="true">
                    {message.role === "human" ? <Avatar avatarUrl={account?.avatarUrl ?? null} decorative displayName={account?.displayName ?? (locale === "zh-CN" ? "我" : "You")} kind="human" size="small" /> : <Avatar avatarUrl={null} decorative displayName={history.conversation.ipProfile.displayName} identityId={history.conversation.ipProfile.id} kind="ip" size="small" />}
                  </div>
                  <div className={styles.messageContent}>
                    <p>{message.body}</p>
                    {message.deliveryState === "failed" && !message.generation ? (
                      <span className={styles.failedMarker}>{labels.messageFailed}</span>
                    ) : null}
                    <div className={styles.messageMeta}>
                      <time dateTime={message.createdAt}>{messageTime(message.createdAt, locale)}</time>
                      {message.role === "human" && message.deliveryState !== "pending" && message.deliveryState !== "failed" ? <span aria-label={locale === "zh-CN" ? "已读" : "Read"} role="img">✓✓</span> : null}
                    </div>
                  </div>
                </li>
                <AiGenerationSnapshot message={message} locale={locale} />
              </Fragment>
            ))}
          </ol>
        )}
        <p aria-live="polite" className={styles.liveStatus}>
          {items.some(
            (message) =>
              message.deliveryState === "pending" && !message.generation,
          )
            ? labels.sending
            : ""}
        </p>
      </div>
      <ChatComposer
        conversationId={history.conversation.id}
        key={history.conversation.id}
        labels={labels}
        locale={locale}
        messages={items}
        onMessages={(nextItems) => {
          setItems(nextItems);
          const latestMessage = nextItems.filter(message => message.deliveryState !== "pending" && message.deliveryState !== "failed").at(-1);
          if (!latestMessage) return;
          if (queryClient && account) {
            const conversation = {
              ...history.conversation,
              lastMessage: { role: latestMessage.role, body: latestMessage.body, createdAt: latestMessage.createdAt },
              updatedAt: latestMessage.createdAt,
            };
            queryClient.setQueriesData<AiInboxResult>(
              {queryKey: ['ai-chat', `${account.kind}:${account.id}`, locale, 'inbox']},
              cached => cached?.status === 'ok' ? {
                ...cached,
                data: {...cached.data, items: [conversation, ...cached.data.items.filter(item => item.id !== conversation.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))},
              } : cached,
            );
          }
          window.dispatchEvent(
            new CustomEvent('aifans:ip-conversation-activity', {
              detail: {
                ...history.conversation,
                lastMessage: {
                  role: latestMessage.role,
                  body: latestMessage.body,
                  createdAt: latestMessage.createdAt,
                },
                updatedAt: latestMessage.createdAt,
              },
            }),
          );
        }}
        sendEnabled={history.conversation.sendEnabled}
        onActivityChange={(value) => {
          streaming.current = value;
          if (value) refreshController.current?.abort();
        }}
        onSettled={() => void refresh()}
      />
    </ConversationDetailSurface>
  );
}
