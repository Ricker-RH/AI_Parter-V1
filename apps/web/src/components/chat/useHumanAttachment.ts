"use client";

import { HumanMediaDownloadSchema, type HumanMediaDownload } from "@aifans/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { humanRequest } from "../../lib/human-chat-client";

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
    queryFn: async ({ signal }) =>
      validateDownload(
        await humanRequest(`attachments/${attachmentId}/download`, signal),
        attachmentId,
        kind,
      ),
    retry: false,
  });
  const expiresAt = query.data ? Date.parse(query.data.expiresAt) : 0;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      () => void client.invalidateQueries({ queryKey: key }),
      Math.min(2_147_483_647, Math.max(0, expiresAt - Date.now() - 10_000)),
    );
    return () => window.clearTimeout(timer);
  }, [client, expiresAt, key]);
  return { ...query, expiresAt };
}
