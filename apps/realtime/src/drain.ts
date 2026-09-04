import {configured,upstreamHeaders,type Configuration} from './gateway.js'

/** Test-environment scheduled safety net; commands also wake the API outbox. */
export async function drainOutbox(env:Configuration,fetcher:typeof fetch=fetch):Promise<void> {
  if(!configured(env)) throw new Error('Realtime drain unavailable')
  try {
    const response=await fetcher(`${new URL(env.UPSTREAM_API_URL!).origin}/v1/internal/realtime/deliver`,{
      method:'POST',redirect:'manual',body:'{}',signal:AbortSignal.timeout(25000),
      headers:upstreamHeaders(env),
    })
    await response.body?.cancel()
    if(!response.ok) throw new Error()
  } catch {throw new Error('Realtime drain unavailable')}
}
