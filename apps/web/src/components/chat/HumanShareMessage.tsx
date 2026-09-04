"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HumanShareResolutionSchema,
  type HumanShareResolution,
  type HumanShareTarget,
} from "@aifans/contracts";
import { humanRequest } from "../../lib/human-chat-client";
import type { Locale } from "../../i18n/config";
import styles from "./MessagesWorkspace.module.css";
export function HumanShareMessage({
  target,
  locale,
  onError,
}: {
  target: HumanShareTarget;
  locale: Locale;
  onError: (cause: unknown) => void;
}) {
  const [result, setResult] = useState<HumanShareResolution | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const callback = useRef(onError);
  callback.current = onError;
  const zh = locale === "zh-CN";
  useEffect(() => {
    const owner = new AbortController();
    setResult(null);
    setFailed(false);
    void (async () => {
      try {
        const value = HumanShareResolutionSchema.parse(
          await humanRequest(
            `share-targets/${target.kind}/${target.id}`,
            owner.signal,
          ),
        );
        if (owner.signal.aborted) return;
        if (
          value.state === "available" &&
          (value.card.target.kind !== target.kind ||
            value.card.target.id !== target.id)
        )
          throw Error("HUMAN_CHAT_INVALID_RESPONSE");
        setResult(value);
      } catch (cause) {
        if (!owner.signal.aborted) {
          setFailed(true);
          callback.current(cause);
        }
      }
    })();
    return () => owner.abort();
  }, [target.kind, target.id, attempt]);
  const segment =
    target.kind === "post"
      ? "posts"
      : target.kind === "human"
        ? "humans"
        : "profiles";
  return (
    <div className={styles.shareCard}>
      {failed ? (
        <button
          className={styles.older}
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {zh ? "重新加载分享" : "Reload shared content"}
        </button>
      ) : !result ? (
        <span role="status">
          {zh ? "加载分享…" : "Loading shared content…"}
        </span>
      ) : result.state === "unavailable" ? (
        <span>{zh ? "分享内容已不可用" : "Shared content unavailable"}</span>
      ) : (
        <Link href={`/${locale}/${segment}/${result.card.target.id}`}>
          <strong>{result.card.title}</strong>
          <span>{result.card.subtitle}</span>
        </Link>
      )}
    </div>
  );
}
