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
import { HumanMediaControls } from "./HumanMediaControls";
import { HumanMediaMessage } from "./HumanMediaMessage";
import { ChatIcon } from "./ChatIcon";
import { createTypingSignal } from "../../lib/human-typing";
import { HumanRichComposer } from "./HumanRichComposer";
import { HumanShareMessage } from "./HumanShareMessage";
import { HumanSticker } from "./HumanSticker";

type Props = {
  conversation: HumanConversation;
  selfProfileId: string;
  labels: MessagesLabels;
  locale: Locale;
  revision: number;
  realtimeMessage?: HumanMessage | null;
  onChanged: () => void;
  onAccessRevoked?: (conversationId: string) => void;
  peerReadSequence?: number | undefined;
  revoked?: boolean;
  sectionHeader?: ReactNode;
  peerTyping?: boolean;
  peerOnline?: boolean;
  onTyping?: (isTyping: boolean) => void;
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
  realtimeMessage,
  onChanged,
  onAccessRevoked,
  peerReadSequence,
  revoked = false,
  sectionHeader,
  peerTyping = false,
  peerOnline = false,
  onTyping,
}: Props) {
  const peer = conversation.participants.find(
    (person) => person.id !== selfProfileId,
  )!;
  const [items, setItems] = useState<HumanMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [richBusy, setRichBusy] = useState(false);
  const [panel, setPanel] = useState<"emoji" | "more" | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceSlot, setVoiceSlot] = useState<HTMLDivElement | null>(null);
  const selection = useRef([0, 0]);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const typingCallback = useRef(onTyping);
  typingCallback.current = onTyping;
  const typing = useRef<ReturnType<typeof createTypingSignal> | null>(null);
  useEffect(() => {
    const signal = createTypingSignal(conversation.id, (frame) =>
      typingCallback.current?.(frame.isTyping),
    );
    typing.current = signal;
    const stop = () => signal.change(false);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      signal.dispose();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [conversation.id]);
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
          sent: "已发送",
          readFailed: "已读状态更新失败，请重试。",
          more: "加载更多消息",
        }
      : {
          blocked: "Messaging is unavailable because access has changed.",
          mutual: "One message sent. Follow each other to continue chatting.",
          read: "Read",
          sent: "Sent",
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
    // A reconciliation must retain a usable history; only the first empty read
    // owns the visible loading state.
    setLoading(messages.current.length === 0);
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
    if (
      !realtimeMessage ||
      realtimeMessage.conversationId !== conversation.id ||
      revoked
    )
      return;
    const next = mergeHumanMessages(messages.current, [realtimeMessage]);
    if (next === messages.current) return;
    messages.current = next;
    setItems(next);
  }, [conversation.id, realtimeMessage, revoked]);
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
      name={
        peerTyping
          ? locale === "zh-CN"
            ? "对方正在输入中…"
            : "Typing…"
          : peer.displayName
      }
      status={peerOnline ? (locale === "zh-CN" ? "在线" : "Online") : undefined}
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
              {message.content.kind === "text" ? (
                <p>{message.content.text}</p>
              ) : message.content.kind === "image" ||
                message.content.kind === "voice" ? (
                <HumanMediaMessage
                  attachmentId={message.content.attachmentId}
                  kind={message.content.kind}
                  zh={locale === "zh-CN"}
                  onError={handleError}
                />
              ) : message.content.kind === "share" ? (
                <HumanShareMessage
                  target={message.content.target}
                  locale={locale}
                  revision={revision}
                  onError={handleError}
                />
              ) : message.content.kind === "sticker" ? (
                <HumanSticker
                  stickerId={message.content.stickerId}
                  locale={locale}
                />
              ) : (
                <p>{labels.invalidResponse}</p>
              )}
              {message.senderProfileId === selfProfileId ? (
                <span
                  className={styles.preview}
                  role="img"
                  aria-label={
                    peerReadSequence !== undefined &&
                    peerReadSequence >= message.sequence
                      ? text.read
                      : text.sent
                  }
                >
                  {peerReadSequence !== undefined &&
                  peerReadSequence >= message.sequence
                    ? "✓✓"
                    : "✓"}
                </span>
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
        leading={
          <button
            type="button"
            className={styles.composerIcon}
            aria-label={
              voiceMode
                ? locale === "zh-CN"
                  ? "键盘"
                  : "Keyboard"
                : locale === "zh-CN"
                  ? "语音"
                  : "Voice"
            }
            disabled={sending || mediaBusy || richBusy || denied || revoked}
            onClick={() => {
              setVoiceMode(!voiceMode);
              setPanel(null);
              typing.current?.change(false);
              if (voiceMode)
                requestAnimationFrame(() => textarea.current?.focus());
            }}
          >
            <ChatIcon name={voiceMode ? "keyboard" : "voice"} />
          </button>
        }
        trailing={
          <>
            <button
              type="button"
              className={styles.composerIcon}
              aria-label={locale === "zh-CN" ? "表情" : "Emoji"}
              aria-expanded={panel === "emoji"}
              disabled={sending || mediaBusy || richBusy || denied || revoked}
              onClick={() => {
                selection.current = [
                  textarea.current?.selectionStart ?? draft.length,
                  textarea.current?.selectionEnd ?? draft.length,
                ];
                textarea.current?.blur();
                setVoiceMode(false);
                setPanel(panel === "emoji" ? null : "emoji");
              }}
            >
              <ChatIcon name="emoji" />
            </button>
            {!draft.trim() || voiceMode ? (
              <button
                type="button"
                className={styles.composerIcon}
                aria-label={locale === "zh-CN" ? "更多功能" : "More actions"}
                aria-expanded={panel === "more"}
                disabled={sending || mediaBusy || richBusy || denied || revoked}
                onClick={() => {
                  textarea.current?.blur();
                  setVoiceMode(false);
                  setPanel(panel === "more" ? null : "more");
                }}
              >
                <ChatIcon name="plus" />
              </button>
            ) : null}
          </>
        }
        alternativeInput={
          voiceMode ? (
            <div className={styles.voiceSlot} ref={setVoiceSlot} />
          ) : undefined
        }
        onFocus={() => setPanel(null)}
        draft={draft}
        setDraft={(value) => {
          setDraft(value);
          typing.current?.change(Boolean(value.trim()));
          setFailure(null);
        }}
        sending={sending}
        attachmentActive={mediaBusy || richBusy}
        textareaRef={textarea}
        onBlur={() => typing.current?.change(false)}
        tools={
          <div
            className={styles.compactTools}
            data-open={panel !== null || mediaBusy || richBusy}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setPanel(null);
                textarea.current?.focus();
              }
            }}
          >
            {panel === "emoji" ? (
              <div
                className={styles.emojiGrid}
                aria-label={locale === "zh-CN" ? "选择表情" : "Choose emoji"}
              >
                {["😀", "😂", "🥰", "👍", "❤️", "🎉", "🙏", "😊"].map(
                  (emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={emoji}
                      onClick={() => {
                        const start = selection.current[0] ?? draft.length,
                          end = selection.current[1] ?? start;
                        const next =
                          draft.slice(0, start) + emoji + draft.slice(end);
                        if (next.length <= 4000) {
                          setDraft(next);
                          setFailure(null);
                        }
                        setPanel(null);
                        requestAnimationFrame(() => {
                          textarea.current?.focus();
                          textarea.current?.setSelectionRange(
                            start + emoji.length,
                            start + emoji.length,
                          );
                        });
                      }}
                    >
                      {emoji}
                    </button>
                  ),
                )}
              </div>
            ) : null}
            <HumanMediaControls
              compact
              showLibrary={panel === "more"}
              voiceSlot={voiceMode ? voiceSlot : null}
              peerId={peer.id}
              conversationId={conversation.id}
              selfProfileId={selfProfileId}
              locale={locale}
              disabled={sending || richBusy || denied || revoked}
              onBusy={setMediaBusy}
              onError={handleError}
              onSent={() => {
                setError(null);
                void refresh();
                changed.current();
              }}
            />
            <HumanRichComposer
              panel={panel}
              peerId={peer.id}
              conversationId={conversation.id}
              selfProfileId={selfProfileId}
              locale={locale}
              disabled={sending || mediaBusy || denied || revoked}
              onBusy={setRichBusy}
              onError={handleError}
              onSent={() => {
                setError(null);
                void refresh();
                changed.current();
              }}
            />
          </div>
        }
        labels={labels}
        sendEnabled={!denied && !revoked}
        error={error}
        notice={denied ? text.blocked : undefined}
        onSend={() => {
          typing.current?.change(false);
          if (!mediaBusy && !richBusy) void send(failure ?? undefined);
        }}
        onRetry={failure ? () => void send(failure) : undefined}
      />
    </ConversationDetailSurface>
  );
}
