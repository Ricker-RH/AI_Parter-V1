"use client";
import {
  HumanMessageSchema,
  HumanReadCursorSchema,
  type HumanConversation,
  type HumanMessage,
} from "@aifans/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "../../i18n/config";
import type { MessagesLabels } from "./MessagesWorkspace";
import {
  humanHistory,
  humanRequest,
  mergeHumanMessages,
} from "../../lib/human-chat-client";
import { authHref } from "../../lib/auth/return-to";
import { ChatComposerForm } from "./ChatComposer";
import { ConversationDetailSurface } from "./ConversationDetail";
import { HumanAvatar } from "../account/HumanAvatar";
import styles from "./MessagesWorkspace.module.css";

type Props = {
  conversation: HumanConversation;
  selfProfileId: string;
  labels: MessagesLabels;
  locale: Locale;
  revision: number;
  onChanged: () => void;
  onAccessRevoked?: (conversationId: string) => void;
  peerReadSequence?: number | undefined;
  revoked?: boolean;
  sectionHeader?: ReactNode;
};
export function HumanConversationDetail(props: Props) {
  return (
    <HumanDetail
      key={`${props.selfProfileId}:${props.conversation.id}`}
      {...props}
    />
  );
}
function HumanDetail({
  conversation,
  selfProfileId,
  labels,
  locale,
  revision,
  onChanged,
  onAccessRevoked,
  peerReadSequence,
  revoked = false,
  sectionHeader,
}: Props) {
  const peer = conversation.participants.find(
    (person) => person.id !== selfProfileId,
  )!;
  const [items, setItems] = useState<HumanMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    text: string;
    clientRequestId: string;
  } | null>(null);
  const [denied, setDenied] = useState(false);
  const [readError, setReadError] = useState(false);
  const lifecycle = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const messages = useRef<HumanMessage[]>([]);
  const readSequence = useRef(0);
  const reading = useRef(false);
  const sendingRef = useRef(false);
  const messageArea = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const accessRevoked = useRef(onAccessRevoked);
  accessRevoked.current = onAccessRevoked;
  const text =
    locale === "zh-CN"
      ? {
          blocked: "无法发送消息，对方关系或账号权限已变更。",
          mutual: "已发送一条消息，互相关注后可继续聊天。",
          read: "已读",
          readFailed: "已读状态更新失败，请重试。",
          more: "加载更多消息",
        }
      : {
          blocked: "Messaging is unavailable because access has changed.",
          mutual: "One message sent. Follow each other to continue chatting.",
          read: "Read",
          readFailed: "Could not update read status. Please retry.",
          more: "Load more messages",
        };
  function revokeAccess() {
    lifecycle.current?.abort();
    historyRequest.current?.abort();
    setDenied(true);
    setItems([]);
    messages.current = [];
    setDraft("");
    setFailure(null);
    setSending(false);
    setLoading(false);
    setReadError(false);
    setError(text.blocked);
    accessRevoked.current?.(conversation.id);
  }
  function handleError(cause: unknown) {
    const code = (cause as Error).message;
    if (code === "UNAUTHORIZED") {
      revokeAccess();
      globalThis.location.assign(
        authHref(
          locale,
          `/${locale}/messages?humanConversation=${conversation.id}`,
        ),
      );
      return;
    }
    if (code === "HUMAN_CHAT_BLOCKED" || code === "HUMAN_CHAT_NOT_FOUND") {
      revokeAccess();
    } else
      setError(
        code === "HUMAN_CHAT_MUTUAL_FOLLOW_REQUIRED"
          ? text.mutual
          : labels.unavailable,
      );
  }
  const refresh = useCallback(async () => {
    const owner = lifecycle.current;
    if (!owner || owner.signal.aborted) return;
    historyRequest.current?.abort();
    const request = new AbortController();
    historyRequest.current = request;
    const stop = () => request.abort();
    owner.signal.addEventListener("abort", stop, { once: true });
    setLoading(true);
    try {
      let after = messages.current.at(-1)?.sequence ?? 0;
      // Bounded catch-up; the continuation remains available for exceptionally large histories.
      for (let page = 0; page < 20; page++) {
        const batch = humanHistory(
          await humanRequest(
            `conversations/${conversation.id}/messages?afterSequence=${after}&limit=100`,
            request.signal,
          ),
          conversation.id,
        );
        if (request.signal.aborted || owner.signal.aborted) return;
        if (
          batch.some(
            (message) =>
              !conversation.participants.some(
                (person) => person.id === message.senderProfileId,
              ) || message.sequence <= after,
          )
        )
          throw Error("HUMAN_CHAT_INVALID_RESPONSE");
        messages.current = mergeHumanMessages(messages.current, batch);
        setItems(messages.current);
        setMore(batch.length === 100);
        if (batch.length < 100) break;
        after = batch.at(-1)!.sequence;
      }
    } catch (cause) {
      if (!request.signal.aborted && !owner.signal.aborted) handleError(cause);
    } finally {
      owner.signal.removeEventListener("abort", stop);
      if (!request.signal.aborted && !owner.signal.aborted) setLoading(false);
    }
  }, [conversation.id, selfProfileId]);
  useEffect(() => {
    const owner = new AbortController();
    lifecycle.current = owner;
    return () => {
      owner.abort();
      historyRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!revoked) void refresh();
  }, [refresh, revision, revoked]);
  useEffect(() => {
    if (revoked) {
      lifecycle.current?.abort();
      historyRequest.current?.abort();
      setItems([]);
      messages.current = [];
      setDenied(true);
      setError(text.blocked);
    }
  }, [revoked]);
  const acknowledge = useCallback(async () => {
    const owner = lifecycle.current;
    const last = messages.current.at(-1)?.sequence ?? 0;
    if (
      !owner ||
      owner.signal.aborted ||
      reading.current ||
      !atBottom.current ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      last <= readSequence.current
    )
      return;
    reading.current = true;
    try {
      const result = HumanReadCursorSchema.parse(
        await humanRequest(
          `conversations/${conversation.id}/read`,
          owner.signal,
          { lastReadSequence: last },
        ),
      );
      if (owner.signal.aborted) return;
      if (
        result.conversationId !== conversation.id ||
        result.profileId !== selfProfileId ||
        result.lastReadSequence < last
      )
        throw Error();
      readSequence.current = result.lastReadSequence;
      setReadError(false);
      changed.current();
    } catch (cause) {
      if (!owner.signal.aborted) {
        if (
          [
            "UNAUTHORIZED",
            "HUMAN_CHAT_BLOCKED",
            "HUMAN_CHAT_NOT_FOUND",
          ].includes((cause as Error).message)
        )
          handleError(cause);
        else setReadError(true);
      }
    } finally {
      reading.current = false;
    }
  }, [conversation.id, selfProfileId]);
  useEffect(() => {
    if (atBottom.current && messageArea.current)
      messageArea.current.scrollTop = messageArea.current.scrollHeight;
    void acknowledge();
    const visible = () => {
      void acknowledge();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, [items, acknowledge]);
  async function send(
    input = { text: draft.trim(), clientRequestId: crypto.randomUUID() },
  ) {
    const owner = lifecycle.current;
    if (
      !input.text ||
      !owner ||
      owner.signal.aborted ||
      sendingRef.current ||
      denied ||
      revoked
    )
      return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const value = await humanRequest(
        `peers/${peer.id}/messages`,
        owner.signal,
        {
          clientRequestId: input.clientRequestId,
          content: { kind: "text", text: input.text },
        },
      );
      if (owner.signal.aborted) return;
      if (
        !value ||
        typeof value !== "object" ||
        Object.keys(value).length !== 1 ||
        !("message" in value)
      )
        throw Error();
      const message = HumanMessageSchema.parse(value.message);
      if (
        message.conversationId !== conversation.id ||
        message.senderProfileId !== selfProfileId ||
        message.clientRequestId !== input.clientRequestId
      )
        throw Error();
      // Catch up history first: do not advance past messages received concurrently with this send.
      setDraft("");
      setFailure(null);
      await refresh();
      changed.current();
    } catch (cause) {
      if (!owner.signal.aborted) {
        setFailure(input);
        handleError(cause);
      }
    } finally {
      if (!owner.signal.aborted) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }
  return (
    <ConversationDetailSurface
      name={peer.displayName}
      username={peer.username}
      backLabel={labels.back}
      backHref={`/${locale}/messages`}
      avatar={<HumanAvatar decorative human={peer} size="small" />}
      sectionHeader={sectionHeader}
    >
      <div
        className={styles.messageArea}
        ref={messageArea}
        onScroll={() => {
          const area = messageArea.current;
          if (area) {
            atBottom.current =
              area.scrollHeight - area.scrollTop - area.clientHeight <= 24;
            if (atBottom.current) void acknowledge();
          }
        }}
      >
        {loading ? (
          <p className={styles.detailNotice} role="status">
            {labels.loadingMore}
          </p>
        ) : null}
        {!loading && items.length === 0 && !denied ? (
          <p className={styles.detailNotice}>{labels.emptyHistory}</p>
        ) : null}
        <ol className={styles.messageList}>
          {items.map((message) => (
            <li
              className={
                message.senderProfileId === selfProfileId
                  ? styles.humanMessage
                  : styles.assistantMessage
              }
              key={message.id}
            >
              <p>
                {message.content.kind === "text"
                  ? message.content.text
                  : labels.invalidResponse}
              </p>
              {message.senderProfileId === selfProfileId &&
              peerReadSequence !== undefined &&
              peerReadSequence >= message.sequence ? (
                <span className={styles.preview}>{text.read}</span>
              ) : null}
            </li>
          ))}
        </ol>
        {more ? (
          <button
            className={styles.more}
            disabled={loading}
            onClick={() => void refresh()}
          >
            {text.more}
          </button>
        ) : null}
        {readError ? (
          <p className={styles.detailNotice} role="alert">
            {text.readFailed}
            <button className={styles.older} onClick={() => void acknowledge()}>
              {labels.retry}
            </button>
          </p>
        ) : null}
      </div>
      <ChatComposerForm
        draft={draft}
        setDraft={(value) => {
          setDraft(value);
          setFailure(null);
        }}
        sending={sending}
        labels={labels}
        sendEnabled={!denied && !revoked}
        error={error}
        notice={denied ? text.blocked : undefined}
        onSend={() => void send(failure ?? undefined)}
        onRetry={failure ? () => void send(failure) : undefined}
      />
    </ConversationDetailSurface>
  );
}
