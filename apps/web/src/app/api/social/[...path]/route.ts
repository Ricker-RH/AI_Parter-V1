import {ApiErrorSchema, CreateHumanCommentSchema, PublicCommentSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../../lib/server-api'
import {invalidateSocialMutation} from '../../../../lib/social-invalidation'

type RouteContext = {params: Promise<{path: string[]}>}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMMENT_BODY_LIMIT=8192

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

function declaredBodyTooLarge(request:Request):boolean { const value=request.headers.get('content-length');return value!==null&&(!/^\d+$/.test(value)||Number(value)>COMMENT_BODY_LIMIT) }
async function readCommentBody(request:Request):Promise<string>{if(declaredBodyTooLarge(request))throw new Error('BODY_TOO_LARGE');if(!request.body)return'';const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>COMMENT_BODY_LIMIT){await reader.cancel();throw new Error('BODY_TOO_LARGE')}chunks.push(value)}}}finally{reader.releaseLock()}const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(joined)}

function responseHeaders(upstream: Response): HeadersInit {
  const headers: Record<string, string> = {'cache-control': 'private, no-store', 'content-type': 'application/json'}
  const requestId = upstream.headers.get('x-request-id')
  if (requestId) headers['x-request-id'] = requestId
  return headers
}

async function safeUpstreamError(upstream: Response): Promise<Response> {
  if (upstream.status === 401) return Response.json({code: 'AUTH_REQUIRED'}, {status: 401, headers: responseHeaders(upstream)})
  try {
    const parsed = ApiErrorSchema.safeParse(await upstream.json() as unknown)
    if (parsed.success) return Response.json(parsed.data, {status: upstream.status, headers: responseHeaders(upstream)})
  } catch {}
  return Response.json({code: 'SOCIAL_INVALID_RESPONSE'}, {status: 502, headers: responseHeaders(upstream)})
}

function mutationResponse(path: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown): unknown | null {
  if (method === 'POST' && /\/comments$/.test(path)) return PublicCommentSchema.safeParse(body).success ? PublicCommentSchema.parse(body) : null
  const expected = method === 'PUT' ? 'created' : 'deleted'
  if (method === 'PUT' && /\/read$/.test(path)) {
    if (typeof body !== 'object' || body === null) return null
    const entries = Object.entries(body)
    const readAt = entries.length === 1 && entries[0]?.[0] === 'readAt' && typeof entries[0][1] === 'string' ? entries[0][1] : null
    return readAt !== null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(readAt) && !Number.isNaN(Date.parse(readAt)) ? {readAt} : null
  }
  if (typeof body !== 'object' || body === null) return null
  const entries = Object.entries(body)
  return entries.length === 1 && entries[0]?.[0] === expected && typeof entries[0][1] === 'boolean' ? {[expected]: entries[0][1]} : null
}

async function proxy(request: Request, context: RouteContext, method: 'POST' | 'PUT' | 'DELETE') {
  if (!sameOrigin(request)) return Response.json({code:'CSRF_REJECTED'},{status:403})
  if(new URL(request.url).search) return Response.json({code:'INVALID_REQUEST'},{status:400})
  const path = allowedPath((await context.params).path,method)
  if (!path) return new Response(null, {status: 404})
  try {
    let body: string | undefined
    if (method==='POST') {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({code:'INVALID_REQUEST'},{status:422})
      if(declaredBodyTooLarge(request)) return Response.json({code:'PAYLOAD_TOO_LARGE'},{status:413})
      try{body=await readCommentBody(request)}catch{return Response.json({code:'PAYLOAD_TOO_LARGE'},{status:413})}
      if (!body.trim() || duplicateTopLevelKey(body)) return Response.json({code:'COMMENT_INVALID'},{status:422})
      let parsed: unknown
      try { parsed=JSON.parse(body) } catch { return Response.json({code:'COMMENT_INVALID'},{status:422}) }
      const comment=CreateHumanCommentSchema.safeParse(parsed)
      if(!comment.success)return Response.json({code:'COMMENT_INVALID'},{status:422})
      body=JSON.stringify(comment.data)
    }
    const upstream = await fetchAifansApi(`/v1/${path}`, {policy: 'live-no-store', requestInit: {method, headers: request.headers, ...(body===undefined?{}:{body})}, trustedClientHeaders: request.headers})
    if (!upstream.ok) return safeUpstreamError(upstream)
    const expectedStatus = method === 'POST' ? 201 : 200
    if (upstream.status !== expectedStatus) return Response.json({code:'SOCIAL_INVALID_RESPONSE'},{status:502,headers:responseHeaders(upstream)})
    let payload: unknown
    try { payload=await upstream.json() } catch { return Response.json({code:'SOCIAL_INVALID_RESPONSE'},{status:502,headers:responseHeaders(upstream)}) }
    const parsed=mutationResponse(path,method,payload)
    if(parsed===null)return Response.json({code:'SOCIAL_INVALID_RESPONSE'},{status:502,headers:responseHeaders(upstream)})
    invalidateSocialMutation({method,path})
    return Response.json(parsed,{status:upstream.status,headers:responseHeaders(upstream)})
  } catch {
    return Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503})
  }
}

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url)
  const path = (await context.params).path
  const cursors = url.searchParams.getAll('cursor')
  const cursor = cursors[0]
  const profilePath = path.length === 2 && path[0] === 'profiles' && uuid.test(path[1] ?? '')
  const ownerCollectionPath = path.length === 1 && (path[0] === 'likes' || path[0] === 'bookmarks' || path[0] === 'following')
  if ([...url.searchParams.keys()].some((key) => key !== 'cursor') || cursors.length > 1 || (cursor !== undefined && !/^[A-Za-z0-9_-]{1,2048}$/.test(cursor)) || (!profilePath && !ownerCollectionPath)) return Response.json({code: 'INVALID_REQUEST'}, {status: 400})
  try {
    const query = cursor ? `?${new URLSearchParams({cursor})}` : ''
    const upstreamPath = profilePath ? `/v1/profiles/${path[1]}` : `/v1/${path[0]}`
    const upstream = await fetchAifansApi(`${upstreamPath}${query}`, {policy: 'private-cache', requestInit: {method: 'GET'}, trustedClientHeaders: request.headers})
    return new Response(await upstream.arrayBuffer(), {status: upstream.status, headers: {'content-type': upstream.headers.get('content-type') ?? 'application/json'}})
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
