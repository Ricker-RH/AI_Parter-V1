"use client";
import { useEffect, useRef, useState } from "react";
import {
  HUMAN_CHAT_STICKERS,
  HumanMessageSchema,
  HumanShareTargetPageSchema,
  type HumanShareCard,
  type HumanShareTarget,
} from "@aifans/contracts";
import type { Locale } from "../../i18n/config";
import { humanRequest } from "../../lib/human-chat-client";
import { ProfileEditorMenu } from "../profile/ProfileEditorMenu";
import styles from "./MessagesWorkspace.module.css";
import { ChatIcon } from "./ChatIcon";
type Selection = {
  requestId: string;
  content:
    | { kind: "sticker"; stickerId: string }
    | { kind: "share"; target: HumanShareTarget };
  title: string;
  subtitle?: string;
  glyph?: string;
};
type Props = {
  peerId: string;
  conversationId: string;
  selfProfileId: string;
  locale: Locale;
  disabled: boolean;
  onSent: () => void;
  onError: (cause: unknown) => void;
  onBusy: (busy: boolean) => void;
  panel?: "emoji" | "more" | null;
};
export function HumanRichComposer(props: Props) {
  const [mode, setMode] = useState<"stickers" | "share" | null>(null),
    [kind, setKind] = useState<HumanShareTarget["kind"]>("post"),
    [query, setQuery] = useState(""),
    [cards, setCards] = useState<HumanShareCard[]>([]),
    [loading, setLoading] = useState(false),
    [searchFailed, setSearchFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [selection, setSelection] = useState<Selection | null>(null),
    [sending, setSending] = useState(false),
    [failed, setFailed] = useState(false);
  const stickerAnchor = useRef<HTMLButtonElement | null>(null),
    confirmButton = useRef<HTMLButtonElement | null>(null),
    shareAnchor = useRef<HTMLButtonElement | null>(null),
    sendRequest = useRef<AbortController | null>(null),
    locked = useRef(false),
    callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    setMode(null);
  }, [props.panel]);
  useEffect(() => {
    if (selection) confirmButton.current?.focus();
  }, [selection]);
  const zh = props.locale === "zh-CN";
  function cancel() {
    sendRequest.current?.abort();
    locked.current = false;
    setSelection(null);
    setSending(false);
    setFailed(false);
    setMode(null);
    callbacks.current.onBusy(false);
  }
  useEffect(
    () => () => {
      sendRequest.current?.abort();
      callbacks.current.onBusy(false);
    },
    [],
  );
  useEffect(() => {
    if (props.disabled) cancel();
  }, [props.disabled]);
  useEffect(() => {
    if (mode !== "share") return;
    const owner = new AbortController();
    setLoading(true);
    setSearchFailed(false);
    setCards([]);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const page = HumanShareTargetPageSchema.parse(
            await humanRequest(
              `share-targets?${new URLSearchParams({ kind, q: query, limit: "20" })}`,
              owner.signal,
            ),
          );
          if (!owner.signal.aborted) {
            if (page.items.some((card) => card.target.kind !== kind))
              throw Error("HUMAN_CHAT_INVALID_RESPONSE");
            setCards(page.items);
          }
        } catch (cause) {
          if (!owner.signal.aborted) {
            setSearchFailed(true);
            callbacks.current.onError(cause);
          }
        } finally {
          if (!owner.signal.aborted) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      clearTimeout(timer);
      owner.abort();
    };
  }, [mode, kind, query, attempt]);
  function choose(next: Omit<Selection, "requestId">) {
    setSelection({ ...next, requestId: crypto.randomUUID() });
    setFailed(false);
    setMode(null);
    callbacks.current.onBusy(true);
  }
  async function send() {
    if (!selection || locked.current || props.disabled) return;
    locked.current = true;
    setSending(true);
    setFailed(false);
    const request = new AbortController();
    sendRequest.current = request;
    try {
      const value = await humanRequest(
        `peers/${props.peerId}/messages`,
        request.signal,
        { clientRequestId: selection.requestId, content: selection.content },
      );
      if (request.signal.aborted) return;
      const message = HumanMessageSchema.parse(
        (value as { message: unknown }).message,
      );
      if (
        message.conversationId !== props.conversationId ||
        message.senderProfileId !== props.selfProfileId ||
        message.clientRequestId !== selection.requestId ||
        JSON.stringify(message.content) !== JSON.stringify(selection.content)
      )
        throw Error("HUMAN_CHAT_INVALID_RESPONSE");
      cancel();
      callbacks.current.onSent();
    } catch (cause) {
      if (!request.signal.aborted) {
        setFailed(true);
        callbacks.current.onError(cause);
      }
    } finally {
      if (!request.signal.aborted) {
        locked.current = false;
        setSending(false);
      }
    }
  }
  return (
    <div className={styles.mediaTools}>
      {!selection ? (
        <>
          <button
            hidden={props.panel !== undefined && props.panel !== "emoji"}
            ref={stickerAnchor}
            type="button"
            aria-haspopup="menu"
            aria-expanded={mode === "stickers"}
            disabled={props.disabled}
            onClick={() => setMode(mode === "stickers" ? null : "stickers")}
          >
            {props.panel !== undefined ? <ChatIcon name="sticker" /> : null}
            {zh ? "贴纸" : "Stickers"}
          </button>
          <button
            hidden={props.panel !== undefined && props.panel !== "more"}
            ref={shareAnchor}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={mode === "share"}
            disabled={props.disabled}
            onClick={() => setMode(mode === "share" ? null : "share")}
          >
            {props.panel !== undefined ? <ChatIcon name="share" /> : null}
            {zh ? "分享" : "Share"}
          </button>
        </>
      ) : (
        <div className={styles.richPreview}>
          {selection.glyph ? (
            <span
              role="img"
              aria-label={selection.title}
              className={styles.sticker}
            >
              {selection.glyph}
            </span>
          ) : (
            <>
              <strong>{selection.title}</strong>
              <span>{selection.subtitle}</span>
            </>
          )}
          <button
            ref={confirmButton}
            type="button"
            disabled={sending}
            onClick={() => void send()}
          >
            {sending
              ? zh
                ? "发送中…"
                : "Sending…"
              : selection.content.kind === "sticker"
                ? zh
                  ? "发送贴纸"
                  : "Send sticker"
                : zh
                  ? "发送分享"
                  : "Send share"}
          </button>
          <button type="button" onClick={cancel}>
            {zh ? "取消" : "Cancel"}
          </button>
        </div>
      )}
      {mode === "stickers" ? (
        <ProfileEditorMenu
          anchor={stickerAnchor}
          id="human-stickers"
          label={zh ? "选择贴纸" : "Choose sticker"}
          onClose={() => setMode(null)}
        >
          {HUMAN_CHAT_STICKERS.map((sticker) => (
            <button
              type="button"
              role="menuitem"
              key={sticker.id}
              aria-label={sticker.label[props.locale]}
              onClick={() =>
                choose({
                  content: { kind: "sticker", stickerId: sticker.id },
                  title: sticker.label[props.locale],
                  glyph: sticker.glyph,
                })
              }
            >
              <span aria-hidden="true">{sticker.glyph}</span>{" "}
              {sticker.label[props.locale]}
            </button>
          ))}
        </ProfileEditorMenu>
      ) : null}
      {mode === "share" ? (
        <ProfileEditorMenu
          anchor={shareAnchor}
          id="human-share"
          label={zh ? "分享站内内容" : "Share internal content"}
          selector
          onClose={() => setMode(null)}
        >
          <div
            className={styles.shareSearch}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              // This is a selection dialog, not a menu: Tab traverses its controls until dismissed.
              const controls = [
                ...event.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not([disabled]),input:not([disabled])",
                ),
              ];
              const index = controls.indexOf(
                document.activeElement as HTMLElement,
              );
              if (!controls.length) return;
              event.preventDefault();
              event.stopPropagation();
              controls[
                (index + (event.shiftKey ? -1 : 1) + controls.length) %
                  controls.length
              ]?.focus();
            }}
          >
            <div role="group" aria-label={zh ? "内容类型" : "Content type"}>
              {(["post", "human", "ip"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {value === "post"
                    ? zh
                      ? "帖子"
                      : "Posts"
                    : value === "human"
                      ? zh
                        ? "用户"
                        : "Humans"
                      : "IP"}
                </button>
              ))}
            </div>
            <label>
              {zh ? "搜索内容" : "Search content"}
              <input
                type="search"
                value={query}
                maxLength={80}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {loading ? (
              <p role="status">{zh ? "正在搜索…" : "Searching…"}</p>
            ) : searchFailed ? (
              <p role="alert">
                {zh ? "暂时无法搜索。" : "Search unavailable."}
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {zh ? "重试" : "Retry"}
                </button>
              </p>
            ) : cards.length ? (
              cards.map((card) => (
                <button
                  type="button"
                  key={`${card.target.kind}:${card.target.id}`}
                  onClick={() =>
                    choose({
                      content: { kind: "share", target: card.target },
                      title: card.title,
                      subtitle: card.subtitle,
                    })
                  }
                >
                  <strong>{card.title}</strong>
                  <span>{card.subtitle}</span>
                </button>
              ))
            ) : (
              <p>
                {zh
                  ? "没有可分享的结果，请尝试其他关键词。"
                  : "No shareable results. Try another search."}
              </p>
            )}
            <button type="button" onClick={() => setMode(null)}>
              {zh ? "关闭" : "Close"}
            </button>
          </div>
        </ProfileEditorMenu>
      ) : null}
      {failed ? (
        <span role="alert">
          {zh
            ? "发送失败，内容可能已不可用。请重试或取消。"
            : "Send failed; the content may no longer be available. Retry or cancel."}
        </span>
      ) : null}
    </div>
  );
}
