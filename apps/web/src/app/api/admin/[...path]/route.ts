type RouteContext = {params: Promise<{path: string[]}>}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function allowedPath(parts: string[]): string | null {
  if (parts.length === 1 && (parts[0] === 'ips' || parts[0] === 'posts')) return parts[0]
  if (parts.length === 3 && parts[0] === 'posts' && uuid.test(parts[1] ?? '') && parts[2] === 'comments') return parts.join('/')
  return null
}

function apiBaseUrl(): string | null {
  const configured = process.env.AIFANS_API_URL
  return configured?.trim() ? configured.trim().replace(/\/+$/, '') : null
}

export async function POST(request: Request, context: RouteContext) {
  const path = allowedPath((await context.params).path)
  if (!path || new URL(request.url).search) return new Response(null, {status: 404})
  const baseUrl = apiBaseUrl()
  if (!baseUrl) return Response.json({code: 'ADMIN_UNAVAILABLE'}, {status: 503})

  try {
    const body = await request.text()
    const headers: Record<string, string> = {'content-type': 'application/json'}
    const cookie = request.headers.get('cookie')
    const requestId = request.headers.get('x-request-id')
    if (cookie) headers.cookie = cookie
    if (requestId) headers['x-request-id'] = requestId
    const upstream = await fetch(`${baseUrl}/v1/admin/${path}`, {
      body,
      cache: 'no-store',
      credentials: 'include',
      headers,
      method: 'POST',
    })
    const responseHeaders: Record<string, string> = {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    }
    const upstreamRequestId = upstream.headers.get('x-request-id')
    if (upstreamRequestId) responseHeaders['x-request-id'] = upstreamRequestId
    return new Response(await upstream.arrayBuffer(), {status: upstream.status, headers: responseHeaders})
  } catch {
    return Response.json({code: 'ADMIN_UNAVAILABLE'}, {status: 503})
  }
}
