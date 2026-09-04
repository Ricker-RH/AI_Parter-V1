import {RealtimeEventSchema} from '@aifans/contracts'
import {z} from 'zod'

export type RealtimePublisher = {publish(recipientProfileId:string,event:z.infer<typeof RealtimeEventSchema>):Promise<void>}

/** Server-only transport; callers choose recipients from authoritative database data. */
export function createRealtimePublisher(options:{baseUrl:string;secret:string;fetcher?:typeof fetch}):RealtimePublisher {
  try {
    const url=new URL(options.baseUrl)
    if(url.protocol!=='https:' || url.origin!==options.baseUrl || options.secret.length<32 || options.secret.trim()!==options.secret) throw new Error()
  } catch {throw new Error('Invalid realtime publisher configuration')}
  const fetcher=options.fetcher??fetch
  return {
    async publish(recipientProfileId,event) {
      const recipient=z.uuid().parse(recipientProfileId)
      const body=JSON.stringify(RealtimeEventSchema.parse(event))
      if(new TextEncoder().encode(body).byteLength>16384) throw new Error('Invalid realtime event')
      try {
        const response=await fetcher(`${options.baseUrl}/internal/events/${recipient}`,{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
          headers:{authorization:`Bearer ${options.secret}`,'content-type':'application/json'},body,
        })
        await response.body?.cancel()
        if(!response.ok) throw new Error()
      } catch {throw new Error('Realtime delivery unavailable')}
    },
  }
}
