import { fetchAifansApi } from "../../../../lib/server-api";

type RouteContext = { params: Promise<{ path: string[] }> };

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedPath(parts: string[], method: string): string | null {
  if (method === 'GET' && parts.length === 1 && parts[0] === 'channels')
    return parts[0];
  if (method === 'GET' && parts.length === 2 && parts[0] === 'channels' && uuid.test(parts[1] ?? ''))
    return parts.join('/');
  if (method === 'POST' && parts.length === 1 && (parts[0] === "ips" || parts[0] === "posts" || parts[0] === 'channels'))
    return parts[0];
  if (
    parts.length === 2 &&
    method === 'POST' && parts[0] === "post-media" &&
    parts[1] === "upload-intents"
  )
    return parts.join("/");
  if (
    parts.length === 3 &&
    method === 'POST' && parts[0] === "post-media" &&
    uuid.test(parts[1] ?? "") &&
    parts[2] === "register"
  )
    return parts.join("/");
  if (
    parts.length === 3 &&
    method === 'POST' && parts[0] === "posts" &&
    uuid.test(parts[1] ?? "") &&
    parts[2] === "comments"
  )
    return parts.join("/");
  if (parts[0] === 'channels' && uuid.test(parts[1] ?? '')) {
    if (method === 'PATCH' && parts.length === 2) return parts.join('/')
    if (method === 'POST' && parts.length === 3 && (parts[2] === 'publish' || parts[2] === 'archive')) return parts.join('/')
    if (method === 'PUT' && parts.length === 3 && (parts[2] === 'aliases' || parts[2] === 'profiles')) return parts.join('/')
    if (method === 'DELETE' && parts.length === 4 && parts[2] === 'profiles' && uuid.test(parts[3] ?? '')) return parts.join('/')
  }
  return null;
}

function allowedSearch(request: Request, method: string, path: string): string | null {
  const search = new URL(request.url).searchParams;
  if (!search.size) return '';
  if (method !== 'GET' || path !== 'channels') return null;
  const allowed = new Set(['q', 'status', 'limit', 'cursor']);
  const seen = new Set<string>();
  for (const key of search.keys()) {
    if (!allowed.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  return `?${search.toString()}`;
}

async function proxy(request: Request, context: RouteContext, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE') {
  const path = allowedPath((await context.params).path, method);
  const search = path ? allowedSearch(request, method, path) : null;
  if (!path || search === null)
    return new Response(null, { status: 404 });
  if (method !== 'GET' && request.headers.get("origin") !== new URL(request.url).origin)
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
    const upstream = await fetchAifansApi(`/v1/admin/${path}${search}`, {
      policy: 'live-no-store',
      requestInit: {
        ...(body ? {body} : {}),
        headers: request.headers,
        method,
      },
      trustedClientHeaders: request.headers,
    });
    const responseHeaders: Record<string, string> = {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    };
    const upstreamRequestId = upstream.headers.get("x-request-id");
    if (upstreamRequestId) responseHeaders["x-request-id"] = upstreamRequestId;
    const responseBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304 ? null : await upstream.arrayBuffer()
    return new Response(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ code: "ADMIN_UNAVAILABLE" }, { status: 503 });
  }
}

export function POST(request: Request, context: RouteContext) { return proxy(request, context, 'POST') }
export function PATCH(request: Request, context: RouteContext) { return proxy(request, context, 'PATCH') }
export function PUT(request: Request, context: RouteContext) { return proxy(request, context, 'PUT') }
export function DELETE(request: Request, context: RouteContext) { return proxy(request, context, 'DELETE') }
export function GET(request: Request, context: RouteContext) { return proxy(request, context, 'GET') }
