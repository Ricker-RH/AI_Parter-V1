import {ChannelQuerySchema, ChannelPageSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../lib/server-api'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const values = Object.fromEntries(url.searchParams)
  if ([...url.searchParams.keys()].some((key) => key !== 'q' && key !== 'cursor') || url.searchParams.getAll('q').length > 1 || url.searchParams.getAll('cursor').length > 1) return Response.json({code: 'INVALID_REQUEST'}, {status: 400})
  const parsed = ChannelQuerySchema.safeParse(values)
  if (!parsed.success) return Response.json({code: 'INVALID_REQUEST'}, {status: 400})
  const query = new URLSearchParams()
  if (parsed.data.q) query.set('q', parsed.data.q)
  if (parsed.data.cursor) query.set('cursor', parsed.data.cursor)
  try {
    const upstream = await fetchAifansApi(`/v1/channels${query.size ? `?${query}` : ''}`, {policy: 'public-cache'})
    const body: unknown = await upstream.json()
    const page = ChannelPageSchema.safeParse(body)
    return page.success ? Response.json(page.data) : Response.json({code: 'CHANNELS_UNAVAILABLE'}, {status: 503})
  } catch { return Response.json({code: 'CHANNELS_UNAVAILABLE'}, {status: 503}) }
}
