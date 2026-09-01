import {ChatMessageInputSchema, ChatMessageResponseSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../../../lib/server-api'

type RouteContext = {params: Promise<{ipProfileId: string}>}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BODY_LIMIT = 32_768

function responseHeaders(upstream: Response): Record<string, string> {
  const headers: Record<string, string> = {'content-type': upstream.headers.get('content-type') ?? 'application/json'}
  const requestId = upstream.headers.get('x-request-id')
  if (requestId) headers['x-request-id'] = requestId
  return headers
}

export async function POST(request: Request, context: RouteContext) {
  const {ipProfileId} = await context.params
  if (!uuid.test(ipProfileId) || new URL(request.url).search) return new Response(null, {status: 404})
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({code: 'CSRF_REJECTED'}, {status: 403})
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)) return Response.json({code: 'PAYLOAD_TOO_LARGE'}, {status: 413})
  let json: unknown
  try {
    if (!request.body) throw new Error('EMPTY_BODY')
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
            return Response.json({code: 'PAYLOAD_TOO_LARGE'}, {status: 413})
          }
          chunks.push(value)
        }
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return Response.json({code: 'INVALID_REQUEST'}, {status: 422})
  }
  const body = ChatMessageInputSchema.safeParse(json)
  if (!body.success) return Response.json({code: 'INVALID_REQUEST'}, {status: 422})

  let upstream: Response
  try {
    upstream = await fetchAifansApi(`/v1/chat/${ipProfileId}/messages`, {requestInit: {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body.data),
    }, trustedClientHeaders: request.headers})
  } catch {
    return Response.json({code: 'CHAT_UNAVAILABLE'}, {status: 503})
  }

  if (!upstream.ok) {
    return new Response(await upstream.arrayBuffer(), {status: upstream.status, headers: responseHeaders(upstream)})
  }

  try {
    const response = ChatMessageResponseSchema.safeParse(await upstream.json())
    if (!response.success) return Response.json({code: 'CHAT_INVALID_RESPONSE'}, {status: 502})
    return Response.json(response.data, {status: upstream.status, headers: responseHeaders(upstream)})
  } catch {
    return Response.json({code: 'CHAT_INVALID_RESPONSE'}, {status: 502})
  }
}
