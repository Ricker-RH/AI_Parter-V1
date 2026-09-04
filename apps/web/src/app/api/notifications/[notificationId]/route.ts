import {NotificationSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../../lib/server-api'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request, {params}: {params: Promise<{notificationId: string}>}) {
  const {notificationId} = await params
  if (!uuid.test(notificationId) || new URL(request.url).search) return Response.json({code: 'INVALID_REQUEST'}, {status: 400})
  try {
    const upstream = await fetchAifansApi(`/v1/notifications/${notificationId}`, {policy: 'private-cache', requestInit: {method: 'GET'}, trustedClientHeaders: request.headers})
    if (upstream.status === 401) return Response.json({code: 'AUTH_REQUIRED'}, {status: 401, headers: {'cache-control': 'private, no-store'}})
    const body: unknown = await upstream.json()
    const parsed = NotificationSchema.safeParse(body)
    return upstream.ok && parsed.success
      ? Response.json(parsed.data, {headers: {'cache-control': 'private, no-store'}})
      : Response.json({code: 'NOTIFICATION_UNAVAILABLE'}, {status: upstream.status >= 500 ? upstream.status : 502, headers: {'cache-control': 'private, no-store'}})
  } catch { return Response.json({code: 'NOTIFICATION_UNAVAILABLE'}, {status: 503, headers: {'cache-control': 'private, no-store'}}) }
}
