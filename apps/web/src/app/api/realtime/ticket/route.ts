import { fetchAifansApi } from "../../../../lib/server-api";
import {
  cancelBody,
  mime,
  readJsonBody,
  sameOrigin,
  upstreamError,
} from "../../../../lib/chat-proxy";
const headers = { "cache-control": "private, no-store" };
const error = (code: string, status: number) =>
  Response.json({ code }, { status, headers });
export async function POST(request: Request) {
  if (
    !sameOrigin(request) ||
    request.headers.get("origin") !== new URL(request.url).origin ||
    new URL(request.url).protocol !== "https:"
  ) {
    await cancelBody(request);
    return error("CSRF_REJECTED", 403);
  }
  if (new URL(request.url).search || !mime(request, "application/json")) {
    await cancelBody(request);
    return error("INVALID_REQUEST", 422);
  }
  const read = await readJsonBody(request);
  if (read.kind !== "ok") return error("INVALID_REQUEST", 422);
  try {
    const body: unknown = JSON.parse(read.text);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      return error("INVALID_REQUEST", 422);
  } catch {
    return error("INVALID_REQUEST", 422);
  }
  try {
    const upstream = await fetchAifansApi("/v1/realtime/ticket", {
      policy: "live-no-store",
      trustedOrigin: new URL(request.url).origin,
      trustedClientHeaders: request.headers,
      requestInit: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: request.signal,
      },
    });
    if (!upstream.ok) return upstreamError(upstream);
    const value: unknown = await upstream.json();
    if (
      !value ||
      typeof value !== "object" ||
      Object.keys(value).length !== 1 ||
      !("ticket" in value) ||
      typeof value.ticket !== "string" ||
      !value.ticket.trim() ||
      value.ticket.length > 4096
    )
      return error("REALTIME_INVALID_RESPONSE", 502);
    return Response.json({ ticket: value.ticket }, { headers });
  } catch {
    return error("REALTIME_UNAVAILABLE", 503);
  }
}
