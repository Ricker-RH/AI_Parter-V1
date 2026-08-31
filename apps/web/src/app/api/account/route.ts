import {fetchCurrentAccount} from '../../../lib/current-account'

const noStore = {'cache-control': 'no-store, max-age=0'}

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') ?? undefined
  const account = await fetchCurrentAccount({cookie})
  if (!account) return new Response(null, {status: 204, headers: noStore})
  return Response.json({profileId: account.id}, {headers: noStore})
}
