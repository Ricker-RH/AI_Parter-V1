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
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
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
  async function toggleVoice() {
    const player = audio.current;
    if (!player || renewVoice()) return;
    try {
      if (player.paused) await player.play();
      else player.pause();
    } catch {
      setRenderFailed(true);
    }
  }
  function clock(value: number) {
    const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
          <div className={styles.voiceBubble}>
            <audio
              ref={audio}
              className={styles.voiceAudio}
              preload="metadata"
              src={url}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onPlay={() => {
                if (!renewVoice()) setPlaying(true);
              }}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setPosition(0);
              }}
              onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
              onError={() => {
                if (!renewVoice()) setRenderFailed(true);
              }}
            />
            <button
              type="button"
              className={styles.voicePlay}
              aria-label={
                playing
                  ? zh ? "暂停语音" : "Pause voice"
                  : zh ? "播放语音" : "Play voice"
              }
              onClick={() => void toggleVoice()}
            >
              <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
            </button>
            <span className={styles.voiceTime}>{clock(playing ? position : duration)}</span>
            <span className={styles.voiceBars} aria-hidden="true"><i /><i /><i /></span>
          </div>
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
