import {fetchAifansApi} from '../../../../lib/server-api'

type RouteContext = {params: Promise<{path: string[]}>}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function allowedPath(parts: string[], method: 'POST' | 'PUT' | 'DELETE'): string | null {
  if (parts.length !== 3 || !uuid.test(parts[1] ?? '')) return null
  if (method === 'POST' && parts[0] === 'posts' && parts[2] === 'comments') return parts.join('/')
  if (method === 'PUT' && parts[0] === 'notifications' && parts[2] === 'read') return parts.join('/')
  if (method !== 'POST' && parts[0] === 'posts' && (parts[2] === 'like' || parts[2] === 'bookmark')) return parts.join('/')
  if (method !== 'POST' && parts[0] === 'profiles' && parts[2] === 'follow') return parts.join('/')
  return null
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return origin !== null && origin === new URL(request.url).origin
}

function duplicateTopLevelKey(text: string): boolean {
  const keys = new Set<string>()
  let depth = 0
  for (let index=0;index<text.length;index++) {
    const char=text[index]
    if (char==='"') {
      const start=index
      for (index++;index<text.length;index++) {
        if (text[index]==='\\') index++
        else if (text[index]==='"') break
      }
      if (depth===1) {
        let after=index+1
        while (/\s/.test(text[after] ?? '')) after++
        if (text[after]===':') {
          let key: unknown
          try { key=JSON.parse(text.slice(start,index+1)) } catch { return true }
          if (typeof key==='string') { if (keys.has(key)) return true; keys.add(key) }
        }
      }
      continue
    }
    if (char==='{') depth++
    else if (char==='}') depth--
  }
  return false
}

async function proxy(request: Request, context: RouteContext, method: 'POST' | 'PUT' | 'DELETE') {
  if (!sameOrigin(request)) return Response.json({code:'CSRF_REJECTED'},{status:403})
  const path = allowedPath((await context.params).path,method)
  if (!path) return new Response(null, {status: 404})
  try {
    let body: string | undefined
    if (method==='POST') {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({code:'INVALID_REQUEST'},{status:422})
      body=await request.text()
      if (!body.trim() || duplicateTopLevelKey(body)) return Response.json({code:'COMMENT_INVALID'},{status:422})
    }
    const upstream = await fetchAifansApi(`/v1/${path}`, {requestInit: {method, headers: request.headers, ...(body===undefined?{}:{body})}})
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

export function POST(request: Request, context: RouteContext) {
  return proxy(request, context, 'POST')
}

export function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context, 'DELETE')
}
