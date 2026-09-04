"use client";
import { useEffect, useRef, useState } from "react";
import { HumanMessageSchema } from "@aifans/contracts";
import { humanRequest } from "../../lib/human-chat-client";
import {
  mediaContentType,
  uploadHumanMedia,
} from "../../lib/human-media-client";
import type { Locale } from "../../i18n/config";
import styles from "./MessagesWorkspace.module.css";
type Preview = {
  blob: Blob;
  kind: "image" | "voice";
  url: string;
  requestId: string;
  attachmentId?: string;
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
};
export function HumanMediaControls(props: Props) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [recording, setRecording] = useState(false),
    [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState(false);
  const state = useRef<Preview | null>(null),
    owner = useRef<AbortController | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    generation = useRef(0),
    locked = useRef(false);
  const callbacks = useRef(props);
  callbacks.current = props;
  const zh = props.locale === "zh-CN";
  function stopTracks() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }
  function clear() {
    generation.current++;
    owner.current?.abort();
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
    recorder.current = null;
    stopTracks();
    if (state.current) URL.revokeObjectURL(state.current.url);
    state.current = null;
    locked.current = false;
  }
  function cancel() {
    clear();
    setPreview(null);
    setRecording(false);
    setPending(false);
    setBusy(false);
    setError(false);
    callbacks.current.onBusy(false);
  }
  useEffect(
    () => () => {
      clear();
      callbacks.current.onBusy(false);
    },
    [],
  );
  useEffect(() => {
    if (props.disabled) cancel();
  }, [props.disabled]);
  function prepare(blob: Blob, kind: Preview["kind"]) {
    mediaContentType(blob, kind);
    const next = {
      blob,
      kind,
      url: URL.createObjectURL(blob),
      requestId: crypto.randomUUID(),
    };
    if (state.current) URL.revokeObjectURL(state.current.url);
    state.current = next;
    setPreview(next);
    callbacks.current.onBusy(true);
  }
  async function record() {
    if (locked.current || props.disabled) return;
    cancel();
    const token = generation.current;
    setPending(true);
    callbacks.current.onBusy(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error("unsupported");
      const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mime) throw Error("unsupported");
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== generation.current) {
        input.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = input;
      const instance = new MediaRecorder(input, { mimeType: mime });
      recorder.current = instance;
      const chunks: Blob[] = [];
      let bytes = 0;
      const started = Date.now();
      instance.ondataavailable = (event) => {
        if (token !== generation.current) return;
        bytes += event.data.size;
        if (bytes > 10485760) {
          cancel();
          setError(true);
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      instance.onerror = () => {
        if (token === generation.current) {
          cancel();
          setError(true);
        }
      };
      instance.onstop = () => {
        if (token !== generation.current) return;
        stopTracks();
        setRecording(false);
        try {
          prepare(new Blob(chunks, { type: instance.mimeType }), "voice");
        } catch {
          setError(true);
          callbacks.current.onBusy(false);
        }
      };
      instance.start(250);
      setPending(false);
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        const elapsed = Date.now() - started;
        setSeconds(Math.min(60, Math.floor(elapsed / 1000)));
        // Leave room for encoder frame padding and timer scheduling below the server's 60s ceiling.
        if (elapsed >= 59000 && instance.state === "recording") instance.stop();
      }, 250);
    } catch {
      if (token === generation.current) {
        stopTracks();
        setPending(false);
        setError(true);
        callbacks.current.onBusy(false);
      }
    }
  }
  async function send() {
    const item = state.current;
    if (!item || locked.current || props.disabled) return;
    locked.current = true;
    setBusy(true);
    setError(false);
    const request = new AbortController();
    owner.current = request;
    try {
      if (!item.attachmentId) {
        const attachment = await uploadHumanMedia(
          props.peerId,
          item.blob,
          item.kind,
          request.signal,
        );
        if (request.signal.aborted) return;
        item.attachmentId = attachment.attachmentId;
      }
      const value = await humanRequest(
        `peers/${props.peerId}/messages`,
        request.signal,
        {
          clientRequestId: item.requestId,
          content: { kind: item.kind, attachmentId: item.attachmentId },
        },
      );
      if (request.signal.aborted) return;
      const message = HumanMessageSchema.parse(
        (value as { message: unknown }).message,
      );
      if (
        message.conversationId !== props.conversationId ||
        message.senderProfileId !== props.selfProfileId ||
        message.clientRequestId !== item.requestId ||
        message.content.kind !== item.kind ||
        !("attachmentId" in message.content) ||
        message.content.attachmentId !== item.attachmentId
      )
        throw Error("HUMAN_MEDIA_INVALID");
      cancel();
      callbacks.current.onSent();
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(true);
        callbacks.current.onError(cause);
      }
    } finally {
      if (!request.signal.aborted) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className={styles.mediaTools}>
      {!preview && !recording && !pending ? (
        <>
          <label className={styles.mediaAction}>
            {zh ? "图片" : "Image"}
            <input
              aria-label={zh ? "选择图片" : "Choose image"}
              disabled={props.disabled}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  try {
                    setError(false);
                    prepare(file, "image");
                  } catch {
                    setError(true);
                  }
              }}
            />
          </label>
          <label className={styles.mediaAction}>
            {zh ? "拍照" : "Camera"}
            <input
              aria-label={zh ? "拍照" : "Take photo"}
              disabled={props.disabled}
              type="file"
              capture="environment"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  try {
                    setError(false);
                    prepare(file, "image");
                  } catch {
                    setError(true);
                  }
              }}
            />
          </label>
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => void record()}
          >
            {zh ? "语音" : "Voice"}
          </button>
        </>
      ) : null}
      {pending ? (
        <span role="status">
          {zh ? "等待麦克风权限…" : "Waiting for microphone…"}
        </span>
      ) : null}
      {recording ? (
        <>
          <span role="status">
            {zh ? "录音" : "Recording"} {seconds}/60s
          </span>
          <button type="button" onClick={() => recorder.current?.stop()}>
            {zh ? "停止录音" : "Stop recording"}
          </button>
        </>
      ) : null}
      {preview ? (
        <div className={styles.mediaPreview}>
          {preview.kind === "image" ? (
            <img src={preview.url} alt={zh ? "图片预览" : "Image preview"} />
          ) : (
            <audio controls src={preview.url} />
          )}
          <button
            type="button"
            disabled={busy || props.disabled}
            onClick={() => void send()}
          >
            {busy
              ? zh
                ? "发送中…"
                : "Sending…"
              : zh
                ? "发送附件"
                : "Send attachment"}
          </button>
        </div>
      ) : null}
      {preview || recording || pending ? (
        <button type="button" onClick={cancel}>
          {zh ? "取消" : "Cancel"}
        </button>
      ) : null}
      {error ? (
        <span role="alert">
          {zh
            ? "附件处理失败。支持 10MB 内图片或最长 60 秒语音，请重试。"
            : "Attachment failed. Use an image under 10 MB or a voice recording up to 60 seconds. Please retry."}
        </span>
      ) : null}
    </div>
  );
}
