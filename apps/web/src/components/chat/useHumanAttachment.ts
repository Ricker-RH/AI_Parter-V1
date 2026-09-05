"use client";

import { HumanMediaDownloadSchema, type HumanMediaDownload } from "@aifans/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { humanRequest } from "../../lib/human-chat-client";

export type CachedHumanAttachment = HumanMediaDownload & { imageBlob?: Blob };

export function humanAttachmentKey(profileId: string, attachmentId: string) {
  return ["human-chat", profileId, "attachment", attachmentId] as const;
}

function validateDownload(
  value: unknown,
  attachmentId: string,
  kind: "image" | "voice",
): HumanMediaDownload {
  const result = HumanMediaDownloadSchema.parse(value);
  const parsed = new URL(result.url);
  if (
    parsed.username ||
    parsed.password ||
    result.attachment.attachmentId !== attachmentId ||
    result.attachment.kind !== kind ||
    Date.parse(result.expiresAt) <= Date.now()
  )
    throw Error("HUMAN_MEDIA_INVALID");
  return result;
}

export function useHumanAttachment(
  profileId: string,
  attachmentId: string,
  kind: "image" | "voice",
) {
  const client = useQueryClient();
  const key = useMemo(
    () => humanAttachmentKey(profileId, attachmentId),
    [attachmentId, profileId],
  );
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }): Promise<CachedHumanAttachment> => {
      const download = validateDownload(
        await humanRequest(`attachments/${attachmentId}/download`, signal),
        attachmentId,
        kind,
      );
      if (kind !== "image") return download;
      const existing = client.getQueryData<CachedHumanAttachment>(key)?.imageBlob;
      if (existing) return {...download, imageBlob: existing};
      try {
        const response = await fetch(download.url, {
          signal, credentials: "omit", referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw Error("HUMAN_MEDIA_STORAGE_UNAVAILABLE");
        const imageBlob = await response.blob();
        if (!imageBlob.size || imageBlob.size > 10_485_760 || imageBlob.type !== "image/webp")
          throw Error("HUMAN_MEDIA_INVALID");
        return {...download, imageBlob};
      } catch (cause) {
        if (signal.aborted) throw cause;
        // An origin without fetch CORS can still display its signed image.
        return download;
      }
    },
    retry: false,
  });
  const expiresAt = query.data ? Date.parse(query.data.expiresAt) : 0;
  useEffect(() => {
    // Voice authorization is renewed at playback, not mid-recording: replacing
    // an audio src on a timer interrupts native playback and resets its position.
    if (!expiresAt || kind === "voice") return;
    const timer = window.setTimeout(
      () => void client.invalidateQueries({ queryKey: key }),
      Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now() - 10_000)),
    );
    return () => window.clearTimeout(timer);
  }, [client, expiresAt, key, kind]);
  return { ...query, expiresAt };
}
