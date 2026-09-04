import {NotificationPageSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../lib/server-api'

const cursorPattern=/^[A-Za-z0-9_-]{1,2048}$/

export async function GET(request: Request) {
  const url = new URL(request.url)
  const cursors = url.searchParams.getAll('cursor')
  const cursor = cursors[0]
  if ([...url.searchParams.keys()].some((key) => key !== 'cursor') || cursors.length > 1 || (cursor !== undefined && !cursorPattern.test(cursor))) return Response.json({code: 'INVALID_REQUEST'}, {status: 400})
  const query = cursor ? `?${new URLSearchParams({cursor})}` : ''
  try {
    const upstream = await fetchAifansApi(`/v1/notifications${query}`, {policy: 'private-cache', requestInit: {method: 'GET'}, trustedClientHeaders: request.headers})
    if (upstream.status === 401) return Response.json({code: 'AUTH_REQUIRED'}, {status: 401, headers: {'cache-control': 'private, no-store'}})
    const body: unknown = await upstream.json()
    const parsed = NotificationPageSchema.safeParse(body)
    return upstream.ok && parsed.success
      ? Response.json(parsed.data, {headers: {'cache-control': 'private, no-store'}})
      : Response.json({code: 'NOTIFICATIONS_UNAVAILABLE'}, {status: upstream.status >= 500 ? upstream.status : 502, headers: {'cache-control': 'private, no-store'}})
  } catch { return Response.json({code: 'NOTIFICATIONS_UNAVAILABLE'}, {status: 503, headers: {'cache-control': 'private, no-store'}}) }
}
