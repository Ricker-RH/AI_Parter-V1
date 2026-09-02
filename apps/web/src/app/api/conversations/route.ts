import {
  ChatConversationCreateInputSchema,
  ChatConversationPageSchema,
  ChatConversationSummarySchema,
} from "@aifans/contracts";
import { fetchAifansApi } from "../../../lib/server-api";
import {
  cancelBody,
  duplicateTopLevelKey,
  invalidRequest,
  mime,
  readJsonBody,
  responseHeaders,
  sameOrigin,
  upstreamError,
} from "../../../lib/chat-proxy";

async function reject(request: Request, body: object, status: number) {
  await cancelBody(request);
  return Response.json(body, { status });
}

export async function GET(request: Request) {
  if (
    new URL(request.url).searchParams.size &&
    [...new URL(request.url).searchParams.keys()].some(
      (key) => key !== "cursor",
    )
  )
    return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const query = new URL(request.url).search;
    const upstream = await fetchAifansApi(`/v1/chat/conversations${query}`, {policy: 'private-cache'});
    if (!upstream.ok) return upstreamError(upstream);
    const parsed = ChatConversationPageSchema.safeParse(await upstream.json());
    return parsed.success
      ? Response.json(parsed.data, {
          status: upstream.status,
          headers: responseHeaders(upstream),
        })
      : Response.json({ code: "CHAT_INVALID_RESPONSE" }, { status: 502 });
  } catch {
    return Response.json({ code: "CHAT_UNAVAILABLE" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return reject(request, { code: "CSRF_REJECTED" }, 403);
  if (new URL(request.url).search)
    return reject(request, { code: "INVALID_REQUEST" }, 400);
  if (!mime(request, "application/json"))
    return reject(request, { code: "INVALID_REQUEST" }, 422);
  const input = await readJsonBody(request);
  if (input.kind === "too-large")
    return Response.json({ code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  if (
    input.kind !== "ok" ||
    !input.text.trim() ||
    duplicateTopLevelKey(input.text)
  )
    return invalidRequest();
  let value: unknown;
  try {
    value = JSON.parse(input.text);
  } catch {
    return invalidRequest();
  }
  const body = ChatConversationCreateInputSchema.safeParse(value);
  if (!body.success) return invalidRequest();
  try {
    const upstream = await fetchAifansApi("/v1/chat/conversations", {
      policy: 'live-no-store',
      requestInit: {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(body.data),
      },
      trustedClientHeaders: request.headers,
    });
    if (!upstream.ok) return upstreamError(upstream);
    const parsed = ChatConversationSummarySchema.safeParse(
      await upstream.json(),
    );
    return parsed.success
      ? Response.json(parsed.data, {
          status: upstream.status,
          headers: responseHeaders(upstream),
        })
      : Response.json({ code: "CHAT_INVALID_RESPONSE" }, { status: 502 });
  } catch {
    return Response.json({ code: "CHAT_UNAVAILABLE" }, { status: 503 });
  }
}
