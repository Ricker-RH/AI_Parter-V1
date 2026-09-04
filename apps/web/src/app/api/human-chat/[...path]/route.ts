import {
  HumanConversationCreateInputSchema,
  HumanConversationSchema,
  HumanInboxCursorSchema,
  HumanInboxPageSchema,
  HumanMessageSchema,
  HumanReadCursorSchema,
  HumanReadInputSchema,
  HumanSendInputSchema,
  HumanMediaUploadInputSchema,
  HumanMediaUploadSchema,
  HumanMediaAttachmentSchema,
  HumanMediaDownloadSchema,
  HumanStickerIdSchema,
  HumanShareTargetPageSchema,
  HumanShareResolutionSchema,
  HumanShareTargetQuerySchema,
} from "@aifans/contracts";
import { fetchAifansApi } from "../../../../lib/server-api";
import {
  cancelBody,
  duplicateTopLevelKey,
  mime,
  readJsonBody,
  sameOrigin,
  upstreamError,
  uuid,
} from "../../../../lib/chat-proxy";

type Context = { params: Promise<{ path: string[] }> };
const headers = { "cache-control": "private, no-store" };
const error = (code: string, status: number) =>
  Response.json({ code }, { status, headers });
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
async function proxy(
  request: Request,
  context: Context,
  method: "GET" | "POST",
) {
  if (method === "POST" && !sameOrigin(request)) {
    await cancelBody(request);
    return error("CSRF_REJECTED", 403);
  }
  const { path } = await context.params;
  const inbox = path.length === 1 && path[0] === "conversations";
  const shareSearch = path.length === 1 && path[0] === "share-targets";
  const shareResolve =
    path.length === 3 &&
    path[0] === "share-targets" &&
    ["post", "human", "ip"].includes(path[1]!) &&
    uuid.test(path[2]!);
  const history =
    path.length === 3 &&
    path[0] === "conversations" &&
    uuid.test(path[1]!) &&
    path[2] === "messages";
  const read =
    path.length === 3 &&
    path[0] === "conversations" &&
    uuid.test(path[1]!) &&
    path[2] === "read";
  const send =
    path.length === 3 &&
    path[0] === "peers" &&
    uuid.test(path[1]!) &&
    path[2] === "messages";
  const reserve =
    path.length === 3 &&
    path[0] === "peers" &&
    uuid.test(path[1]!) &&
    path[2] === "attachments";
  const finalize =
    path.length === 3 &&
    path[0] === "attachments" &&
    uuid.test(path[1]!) &&
    path[2] === "finalize";
  const download =
    path.length === 3 &&
    path[0] === "attachments" &&
    uuid.test(path[1]!) &&
    path[2] === "download";
  if (
    !(method === "GET"
      ? inbox || history || download || shareSearch || shareResolve
      : inbox || read || send || reserve || finalize)
  ) {
    await cancelBody(request);
    return error("NOT_FOUND", 404);
  }
  const url = new URL(request.url);
  for (const [key, value] of url.searchParams) {
    if (method !== "GET" || url.searchParams.getAll(key).length !== 1)
      return error("INVALID_REQUEST", 400);
    if (shareSearch && ["kind", "q", "limit"].includes(key)) continue;
    if (
      (inbox || history) &&
      key === "limit" &&
      /^(?:[1-9]\d?|100)$/.test(value)
    )
      continue;
    if (
      inbox &&
      key === "cursor" &&
      HumanInboxCursorSchema.safeParse(value).success
    )
      continue;
    if (
      history &&
      key === "afterSequence" &&
      /^(0|[1-9]\d*)$/.test(value) &&
      Number.isSafeInteger(Number(value))
    )
      continue;
    return error("INVALID_REQUEST", 400);
  }
  if (
    shareSearch &&
    !HumanShareTargetQuerySchema.safeParse({
      kind: url.searchParams.get("kind"),
      q: url.searchParams.get("q") ?? "",
      limit: url.searchParams.has("limit")
        ? Number(url.searchParams.get("limit"))
        : 10,
    }).success
  )
    return error("INVALID_REQUEST", 400);
  let body: unknown;
  if (method === "POST") {
    if (!mime(request, "application/json")) {
      await cancelBody(request);
      return error("INVALID_REQUEST", 422);
    }
    const result = await readJsonBody(request);
    if (result.kind !== "ok")
      return error(
        result.kind === "too-large" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST",
        result.kind === "too-large" ? 413 : 422,
      );
    if (duplicateTopLevelKey(result.text)) return error("INVALID_REQUEST", 422);
    try {
      body = JSON.parse(result.text);
    } catch {
      return error("INVALID_REQUEST", 422);
    }
    if (finalize && (!object(body) || Object.keys(body).length))
      return error("INVALID_REQUEST", 422);
    const parsed = finalize
      ? { success: true as const, data: {} }
      : (inbox
          ? HumanConversationCreateInputSchema
          : read
            ? HumanReadInputSchema
            : reserve
              ? HumanMediaUploadInputSchema
              : HumanSendInputSchema
        ).safeParse(body);
    if (!parsed.success) return error("INVALID_REQUEST", 422);
    body = parsed.data;
    if (
      send &&
      "content" in parsed.data &&
      parsed.data.content.kind === "sticker" &&
      !HumanStickerIdSchema.safeParse(parsed.data.content.stickerId).success
    )
      return error("HUMAN_MESSAGE_KIND_UNSUPPORTED", 422);
  }
  try {
    const upstream = await fetchAifansApi(
      `/v1/human-chat/${path.join("/")}${url.search}`,
      {
        policy: "live-no-store",
        trustedClientHeaders: request.headers,
        requestInit: {
          method,
          signal: request.signal,
          ...(method === "POST"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        },
      },
    );
    if (!upstream.ok) return upstreamError(upstream);
    if (upstream.status !== 200 || !mime(upstream, "application/json")) {
      await cancelBody(upstream);
      return error("HUMAN_CHAT_INVALID_RESPONSE", 502);
    }
    const value: unknown = await upstream.json();
    let output: unknown;
    if (shareSearch) output = HumanShareTargetPageSchema.parse(value);
    else if (shareResolve) output = HumanShareResolutionSchema.parse(value);
    else if (reserve) output = HumanMediaUploadSchema.parse(value);
    else if (finalize) output = HumanMediaAttachmentSchema.parse(value);
    else if (download) output = HumanMediaDownloadSchema.parse(value);
    else if (method === "GET" && inbox)
      output = HumanInboxPageSchema.parse(value);
    else if (read) output = HumanReadCursorSchema.parse(value);
    else {
      const key = history ? "items" : send ? "message" : "conversation";
      if (!object(value) || Object.keys(value).length !== 1 || !(key in value))
        throw Error();
      if (history) {
        if (!Array.isArray(value.items) || value.items.length > 100)
          throw Error();
        output = {
          items: value.items.map((item) => HumanMessageSchema.parse(item)),
        };
      } else
        output = {
          [key]: (send ? HumanMessageSchema : HumanConversationSchema).parse(
            value[key],
          ),
        };
    }
    return Response.json(output, { headers });
  } catch {
    return error("HUMAN_CHAT_INVALID_RESPONSE", 502);
  }
}
export const GET = (request: Request, context: Context) =>
  proxy(request, context, "GET");
export const POST = (request: Request, context: Context) =>
  proxy(request, context, "POST");
