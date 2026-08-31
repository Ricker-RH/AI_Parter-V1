import {ChatMessageInputSchema, ChatMessageResponseSchema} from '@aifans/contracts'

type RouteContext = {params: Promise<{ipProfileId: string}>}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function apiBaseUrl(): string | null {
  const configured = process.env.AIFANS_API_URL
  return configured?.trim() ? configured.trim().replace(/\/+$/, '') : null
}

function responseHeaders(upstream: Response): Record<string, string> {
  const headers: Record<string, string> = {'content-type': upstream.headers.get('content-type') ?? 'application/json'}
  const requestId = upstream.headers.get('x-request-id')
  if (requestId) headers['x-request-id'] = requestId
  return headers
}

export async function POST(request: Request, context: RouteContext) {
  const {ipProfileId} = await context.params
  if (!uuid.test(ipProfileId) || new URL(request.url).search) return new Response(null, {status: 404})

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({code: 'INVALID_REQUEST'}, {status: 422})
  }
  const body = ChatMessageInputSchema.safeParse(json)
  if (!body.success) return Response.json({code: 'INVALID_REQUEST'}, {status: 422})

  const baseUrl = apiBaseUrl()
  if (!baseUrl) return Response.json({code: 'CHAT_UNAVAILABLE'}, {status: 503})

  const headers: Record<string, string> = {'content-type': 'application/json'}
  const cookie = request.headers.get('cookie')
  const requestId = request.headers.get('x-request-id')
  if (cookie) headers.cookie = cookie
  if (requestId) headers['x-request-id'] = requestId

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}/v1/chat/${ipProfileId}/messages`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers,
      body: JSON.stringify(body.data),
    })
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
