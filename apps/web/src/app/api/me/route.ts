import {fetchAifansApi} from '../../../lib/server-api'

const BODY_LIMIT = 65_536
const noStore = {'cache-control': 'no-store, max-age=0'}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return origin !== null && origin === new URL(request.url).origin
}

function duplicateTopLevelKey(text: string): boolean {
  const keys = new Set<string>()
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      const start = index
      for (index += 1; index < text.length; index += 1) {
        if (text[index] === '\\') index += 1
        else if (text[index] === '"') break
      }
      if (depth === 1) {
        let end = index + 1
        while (/\s/.test(text[end] ?? '')) end += 1
        if (text[end] === ':') {
          let key: unknown
          try { key = JSON.parse(text.slice(start, index + 1)) } catch { return true }
          if (typeof key === 'string') {
            if (keys.has(key)) return true
            keys.add(key)
          }
        }
      }
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
  }
  return false
}

function declaredTooLarge(request: Request): boolean {
  const value = request.headers.get('content-length')
  return value !== null && (!/^\d+$/.test(value) || Number(value) > BODY_LIMIT)
}

async function readBody(request: Request): Promise<string> {
  if (declaredTooLarge(request)) throw new Error('BODY_TOO_LARGE')
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      if (value) {
        size += value.byteLength
        if (size > BODY_LIMIT) {
          await reader.cancel()
          throw new Error('BODY_TOO_LARGE')
        }
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

async function proxy(request: Request, method: 'GET' | 'PATCH'): Promise<Response> {
  if (method === 'PATCH' && !sameOrigin(request)) return Response.json({code: 'CSRF_REJECTED'}, {status: 403})
  if (new URL(request.url).search) return Response.json({code: 'INVALID_REQUEST'}, {status: 400})
  let body: string | undefined
  if (method === 'PATCH') {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({code: 'INVALID_REQUEST'}, {status: 422})
    try { body = await readBody(request) } catch { return Response.json({code: 'PAYLOAD_TOO_LARGE'}, {status: 413}) }
    if (!body.trim() || duplicateTopLevelKey(body)) return Response.json({code: 'INVALID_REQUEST'}, {status: 422})
  }
  try {
    const upstream = await fetchAifansApi('/v1/me', {policy: method === 'GET' ? 'private-cache' : 'live-no-store', requestInit: {method, headers: request.headers, ...(body === undefined ? {} : {body})}})
    const headers: Record<string, string> = {'content-type': upstream.headers.get('content-type') ?? 'application/json', ...noStore}
    const requestId = upstream.headers.get('x-request-id')
    if (requestId) headers['x-request-id'] = requestId
    return new Response(await upstream.arrayBuffer(), {status: upstream.status, headers})
  } catch {
    return Response.json({code: 'PROFILE_UNAVAILABLE'}, {status: 503, headers: noStore})
  }
}

export function GET(request: Request) { return proxy(request, 'GET') }
export function PATCH(request: Request) { return proxy(request, 'PATCH') }
