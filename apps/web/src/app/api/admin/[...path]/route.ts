import { fetchAifansApi } from "../../../../lib/server-api";

type RouteContext = { params: Promise<{ path: string[] }> };

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedPath(parts: string[]): string | null {
  if (parts.length === 1 && (parts[0] === "ips" || parts[0] === "posts"))
    return parts[0];
  if (
    parts.length === 2 &&
    parts[0] === "post-media" &&
    parts[1] === "upload-intents"
  )
    return parts.join("/");
  if (
    parts.length === 3 &&
    parts[0] === "post-media" &&
    uuid.test(parts[1] ?? "") &&
    parts[2] === "register"
  )
    return parts.join("/");
  if (
    parts.length === 3 &&
    parts[0] === "posts" &&
    uuid.test(parts[1] ?? "") &&
    parts[2] === "comments"
  )
    return parts.join("/");
  return null;
}

export async function POST(request: Request, context: RouteContext) {
  const path = allowedPath((await context.params).path);
  if (!path || new URL(request.url).search)
    return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ code: "CSRF_REJECTED" }, { status: 403 });
  try {
    const declared = request.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 65536))
      return Response.json({ code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    const reader = request.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return Response.json({ code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const upstream = await fetchAifansApi(`/v1/admin/${path}`, {
      policy: 'live-no-store',
      requestInit: {
        body,
        headers: request.headers,
        method: "POST",
      },
      trustedClientHeaders: request.headers,
    });
    const responseHeaders: Record<string, string> = {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    };
    const upstreamRequestId = upstream.headers.get("x-request-id");
    if (upstreamRequestId) responseHeaders["x-request-id"] = upstreamRequestId;
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ code: "ADMIN_UNAVAILABLE" }, { status: 503 });
  }
}
