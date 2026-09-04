import {
  ApiErrorSchema,
  ProfileAssetConfirmationRequestSchema,
  ProfileAssetConfirmationResponseSchema,
  ProfileAssetIntentRequestSchema,
  ProfileAssetIntentSchema,
} from '@aifans/contracts'
import {fetchAifansApi} from '../../../../lib/server-api'

const BODY_LIMIT = 65_536
const NO_STORE = {'cache-control': 'no-store'}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AssetRoute =
  | {kind: 'intent'}
  | {kind: 'confirm'; assetId: string}

function json(body: object, status: number): Response {
  return Response.json(body, {status, headers: NO_STORE})
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function isJson(request: {headers: Headers}): boolean {
  return request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
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
        let after = index + 1
        while (/\s/.test(text[after] ?? '')) after += 1
        if (text[after] === ':') {
          try {
            const key: unknown = JSON.parse(text.slice(start, index + 1))
            if (typeof key === 'string') {
              if (keys.has(key)) return true
              keys.add(key)
            }
          } catch {
            return true
          }
        }
      }
    } else if (char === '{') depth += 1
    else if (char === '}') depth -= 1
  }
  return false
}

async function readBody(request: Request): Promise<{kind: 'ok'; text: string} | {kind: 'invalid'} | {kind: 'too-large'}> {
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)) {
    try { await request.body?.cancel() } catch {}
    return {kind: 'too-large'}
  }
  if (!request.body) return {kind: 'invalid'}
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', {fatal: true})
  let size = 0
  let text = ''
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      if (!value) continue
      size += value.byteLength
      if (size > BODY_LIMIT) {
        try { await reader.cancel() } catch {}
        return {kind: 'too-large'}
      }
      text += decoder.decode(value, {stream: true})
    }
    return {kind: 'ok', text: text + decoder.decode()}
  } catch {
    try { await reader.cancel() } catch {}
    return {kind: 'invalid'}
  } finally {
    reader.releaseLock()
  }
}

function responseHeaders(upstream: Response): HeadersInit {
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  }
  const requestId = upstream.headers.get('x-request-id')
  if (requestId) headers['x-request-id'] = requestId
  return headers
}

export async function proxyProfileAssetPost(request: Request, route: AssetRoute): Promise<Response> {
  if (!sameOrigin(request)) return json({code: 'CSRF_REJECTED'}, 403)
  if (new URL(request.url).search) return json({code: 'INVALID_REQUEST'}, 400)
  if (route.kind === 'confirm' && !uuid.test(route.assetId)) return json({code: 'INVALID_REQUEST'}, 400)
  if (!isJson(request)) return json({code: 'INVALID_REQUEST'}, 422)

  const input = await readBody(request)
  if (input.kind === 'too-large') return json({code: 'PAYLOAD_TOO_LARGE'}, 413)
  if (input.kind !== 'ok' || !input.text.trim() || duplicateTopLevelKey(input.text)) return json({code: 'INVALID_REQUEST'}, 422)

  let value: unknown
  try {
    value = JSON.parse(input.text)
  } catch {
    return json({code: 'INVALID_REQUEST'}, 422)
  }
  let body: string
  if (route.kind === 'intent') {
    const parsed = ProfileAssetIntentRequestSchema.safeParse(value)
    if (!parsed.success) return json({code: 'INVALID_REQUEST'}, 422)
    body = JSON.stringify(parsed.data)
  } else {
    const parsed = ProfileAssetConfirmationRequestSchema.safeParse(value)
    if (!parsed.success || parsed.data.assetId !== route.assetId) return json({code: 'INVALID_REQUEST'}, 422)
    body = JSON.stringify(parsed.data)
  }

  const path = route.kind === 'intent'
    ? '/v1/me/assets/upload-intent'
    : `/v1/me/assets/${route.assetId}/confirm`
  try {
    const upstream = await fetchAifansApi(path, {
      policy: 'live-no-store',
      requestInit: {
        method: 'POST',
        headers: request.headers,
        body,
        signal: request.signal,
      },
      trustedClientHeaders: request.headers,
    })
    if (!isJson(upstream)) return json({code: 'PROFILE_INVALID_RESPONSE'}, 502)
    const upstreamValue: unknown = await upstream.json()
    const output = upstream.ok
      ? (route.kind === 'intent' ? ProfileAssetIntentSchema : ProfileAssetConfirmationResponseSchema).safeParse(upstreamValue)
      : ApiErrorSchema.strict().safeParse(upstreamValue)
    if (!output.success) return json({code: 'PROFILE_INVALID_RESPONSE'}, 502)
    return new Response(JSON.stringify(output.data), {
      status: upstream.status,
      headers: responseHeaders(upstream),
    })
  } catch {
    return json({code: 'PROFILE_UNAVAILABLE'}, 503)
  }
}
