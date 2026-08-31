import {socialApiBaseUrl} from '../../../../lib/social-api'

type RouteContext = {params: Promise<{path: string[]}>}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function allowedPath(parts: string[]): string | null {
  if (parts.length !== 3 || !uuid.test(parts[1] ?? '')) return null
  if (parts[0] === 'posts' && (parts[2] === 'like' || parts[2] === 'bookmark')) return parts.join('/')
  if (parts[0] === 'profiles' && parts[2] === 'follow') return parts.join('/')
  return null
}

async function proxy(request: Request, context: RouteContext, method: 'PUT' | 'DELETE') {
  const path = allowedPath((await context.params).path)
  if (!path) return new Response(null, {status: 404})
  const baseUrl = socialApiBaseUrl()
  if (!baseUrl) return Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503})

  try {
    const cookie = request.headers.get('cookie')
    const upstream = await fetch(`${baseUrl}/v1/${path}`, {
      cache: 'no-store',
      credentials: 'include',
      ...(cookie ? {headers: {cookie}} : {}),
      method,
    })
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {'content-type': upstream.headers.get('content-type') ?? 'application/json'},
    })
  } catch {
    return Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503})
  }
}

export function PUT(request: Request, context: RouteContext) {
  return proxy(request, context, 'PUT')
}

export function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context, 'DELETE')
}
