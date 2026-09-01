import {fetchCurrentAccountResult} from '../../../lib/current-account'

const noStore = {'cache-control': 'no-store, max-age=0'}

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') ?? undefined
  const result = await fetchCurrentAccountResult({cookie})
  if (result.status === 'anonymous' || result.status === 'auth-required') return new Response(null, {status: 204, headers: noStore})
  if (result.status === 'unavailable') return new Response(null, {status: 503, headers: noStore})
  return Response.json({profileId: result.account.id}, {headers: noStore})
}
