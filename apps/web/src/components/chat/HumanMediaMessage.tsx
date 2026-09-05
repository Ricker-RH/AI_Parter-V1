"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./MessagesWorkspace.module.css";
import { useHumanAttachment } from "./useHumanAttachment";
export function HumanMediaMessage({
  selfProfileId,
  attachmentId,
  kind,
  zh,
  onError,
}: {
  selfProfileId: string;
  attachmentId: string;
  kind: "image" | "voice";
  zh: boolean;
  onError: (cause: unknown) => void;
}) {
  const callback = useRef(onError);
  const resume = useRef(false),
    audio = useRef<HTMLAudioElement | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();
  const attachment = useHumanAttachment(selfProfileId, attachmentId, kind);
  const imageBlob = attachment.isError ? undefined : attachment.data?.imageBlob;
  useLayoutEffect(() => {
    if (!imageBlob) { setImageUrl(undefined); return; }
    const url = URL.createObjectURL(imageBlob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);
  callback.current = onError;
  useEffect(() => {
    if (attachment.error) callback.current(attachment.error);
  }, [attachment.error]);
  useEffect(() => setRenderFailed(false), [attachmentId, attachment.data?.url]);
  useEffect(() => {
    if (attachment.data?.url && resume.current) {
      resume.current = false;
      void audio.current?.play().catch(() => {
        /* Native controls remain available if autoplay is blocked. */
      });
    }
  }, [attachment.data?.url]);
  function renewVoice() {
    if (Date.now() < attachment.expiresAt) return false;
    resume.current = true;
    audio.current?.pause();
    void attachment.refetch({ cancelRefetch: false });
    return true;
  }
  const url = imageUrl ?? (imageBlob ? undefined : attachment.data?.url);
  const failed = attachment.isError || renderFailed;
  return (
    <div className={styles.mediaBubble}>
      {url && !failed ? (
        kind === "image" ? (
          <img
            src={url}
            width={attachment.data?.attachment.width}
            height={attachment.data?.attachment.height}
            alt={zh ? "聊天图片" : "Chat image"}
            referrerPolicy="no-referrer"
            onError={() => setRenderFailed(true)}
          />
        ) : (
          <audio
            ref={audio}
            controls
            preload="none"
            src={url}
            onPlay={() => renewVoice()}
            onError={() => {
              if (!renewVoice()) setRenderFailed(true);
            }}
          />
        )
      ) : failed ? (
        <button
          type="button"
          className={styles.older}
          onClick={() => {
            setRenderFailed(false);
            void attachment.refetch();
          }}
        >
          {zh ? "重新加载附件" : "Reload attachment"}
        </button>
      ) : (
        <span role="status">{zh ? "加载附件…" : "Loading attachment…"}</span>
      )}
    </div>
  );
}
