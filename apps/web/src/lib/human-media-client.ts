import {
  HumanMediaUploadInputSchema,
  HumanMediaUploadSchema,
  HumanMediaAttachmentSchema,
} from "@aifans/contracts";
import { humanRequest } from "./human-chat-client";
export function mediaContentType(blob: Blob, kind: "image" | "voice") {
  return HumanMediaUploadInputSchema.parse({
    kind,
    contentType: blob.type.split(";")[0]?.trim().toLowerCase(),
    sizeBytes: blob.size,
  }).contentType;
}
export async function uploadHumanMedia(
  peerId: string,
  blob: Blob,
  kind: "image" | "voice",
  signal: AbortSignal,
) {
  const contentType = mediaContentType(blob, kind);
  const intent = HumanMediaUploadSchema.parse(
    await humanRequest(`peers/${peerId}/attachments`, signal, {
      kind,
      contentType,
      sizeBytes: blob.size,
    }),
  );
  const url = new URL(intent.upload.url);
  if (
    url.username ||
    url.password ||
    intent.upload.headers["content-type"] !== contentType ||
    Date.parse(intent.upload.expiresAt) <= Date.now()
  )
    throw Error("HUMAN_MEDIA_INVALID");
  const uploaded = await fetch(intent.upload.url, {
    method: "PUT",
    headers: intent.upload.headers,
    body: blob,
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  await uploaded.body?.cancel();
  if (!uploaded.ok) throw Error("HUMAN_MEDIA_STORAGE_UNAVAILABLE");
  const result = HumanMediaAttachmentSchema.parse(
    await humanRequest(
      `attachments/${intent.attachmentId}/finalize`,
      signal,
      {},
    ),
  );
  if (result.attachmentId !== intent.attachmentId || result.kind !== kind)
    throw Error("HUMAN_MEDIA_INVALID");
  return result;
}
