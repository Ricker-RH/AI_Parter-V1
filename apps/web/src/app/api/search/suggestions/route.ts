import {fetchAifansApi} from '../../../../lib/server-api'

function normalizedQuery(url: URL): string | null {
  if ([...url.searchParams.keys()].some((key) => key !== 'q')) return null
  const queries = url.searchParams.getAll('q')
  if (queries.length !== 1) return null
  const query = queries[0]?.trim().replace(/\s+/g, ' ') ?? ''
  return query.length >= 1 && query.length <= 80 ? query : null
}

export async function GET(request: Request) {
  const q = normalizedQuery(new URL(request.url))
  if (!q) return Response.json({code: 'INVALID_REQUEST'}, {status: 400})
  const query = new URLSearchParams({q, category: 'all', limit: '8'})
  let upstream: Response
  try {
    upstream = await Promise.resolve().then(() => fetchAifansApi(`/v1/search?${query}`, {
      requestInit: {method: 'GET', signal: request.signal},
      trustedClientHeaders: request.headers,
    }))
  } catch {
    return Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503, headers: {'cache-control': 'private, no-store'}})
  }
  try {
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        'cache-control': 'private, no-store',
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    })
  } catch {
    return Response.json({code: 'SOCIAL_UNAVAILABLE'}, {status: 503, headers: {'cache-control': 'private, no-store'}})
  }
}
