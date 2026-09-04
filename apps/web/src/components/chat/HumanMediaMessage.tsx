"use client";
import { useEffect, useRef, useState } from "react";
import { HumanMediaDownloadSchema } from "@aifans/contracts";
import { humanRequest } from "../../lib/human-chat-client";
import styles from "./MessagesWorkspace.module.css";
export function HumanMediaMessage({
  attachmentId,
  kind,
  zh,
  onError,
}: {
  attachmentId: string;
  kind: "image" | "voice";
  zh: boolean;
  onError: (cause: unknown) => void;
}) {
  const [url, setUrl] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const callback = useRef(onError);
  const expiresAt = useRef(0),
    resume = useRef(false),
    audio = useRef<HTMLAudioElement | null>(null);
  callback.current = onError;
  useEffect(() => {
    const owner = new AbortController();
    setUrl(null);
    setFailed(false);
    void (async () => {
      try {
        const result = HumanMediaDownloadSchema.parse(
          await humanRequest(
            `attachments/${attachmentId}/download`,
            owner.signal,
          ),
        );
        if (owner.signal.aborted) return;
        const parsed = new URL(result.url);
        if (
          parsed.username ||
          parsed.password ||
          result.attachment.attachmentId !== attachmentId ||
          result.attachment.kind !== kind ||
          Date.parse(result.expiresAt) <= Date.now()
        )
          throw Error("HUMAN_MEDIA_INVALID");
        setUrl(result.url);
        expiresAt.current = Date.parse(result.expiresAt);
      } catch (cause) {
        if (!owner.signal.aborted) {
          setFailed(true);
          callback.current(cause);
        }
      }
    })();
    return () => owner.abort();
  }, [attachmentId, kind, attempt]);
  useEffect(() => {
    if (url && resume.current) {
      resume.current = false;
      void audio.current?.play().catch(() => {
        /* Native controls remain available if autoplay is blocked. */
      });
    }
  }, [url]);
  function renewVoice() {
    if (Date.now() < expiresAt.current) return false;
    resume.current = true;
    audio.current?.pause();
    setAttempt((value) => value + 1);
    return true;
  }
  return (
    <div className={styles.mediaBubble}>
      {url && !failed ? (
        kind === "image" ? (
          <img
            src={url}
            alt={zh ? "聊天图片" : "Chat image"}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <audio
            ref={audio}
            controls
            preload="none"
            src={url}
            onPlay={() => renewVoice()}
            onError={() => {
              if (!renewVoice()) setFailed(true);
            }}
          />
        )
      ) : failed ? (
        <button
          type="button"
          className={styles.older}
          onClick={() => setAttempt((x) => x + 1)}
        >
          {zh ? "重新加载附件" : "Reload attachment"}
        </button>
      ) : (
        <span role="status">{zh ? "加载附件…" : "Loading attachment…"}</span>
      )}
    </div>
  );
}
