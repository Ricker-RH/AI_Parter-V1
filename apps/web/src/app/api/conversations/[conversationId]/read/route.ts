import {ChatConversationSummarySchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../../../lib/server-api'
import {cancelBody,responseHeaders,sameOrigin,upstreamError,uuid} from '../../../../../lib/chat-proxy'

type Context={params:Promise<{conversationId:string}>}

export async function POST(request:Request,context:Context){
  const {conversationId}=await context.params
  if(!uuid.test(conversationId)){await cancelBody(request);return new Response(null,{status:404})}
  if(!sameOrigin(request)){await cancelBody(request);return Response.json({code:'CSRF_REJECTED'},{status:403})}
  if(new URL(request.url).search){await cancelBody(request);return Response.json({code:'INVALID_REQUEST'},{status:400})}
  try{
    const upstream=await fetchAifansApi(`/v1/chat/conversations/${conversationId}/read`,{policy:'live-no-store',trustedClientHeaders:request.headers,requestInit:{method:'POST',headers:request.headers,signal:request.signal}})
    if(!upstream.ok)return upstreamError(upstream)
    const parsed=ChatConversationSummarySchema.safeParse(await upstream.json())
    return parsed.success?Response.json(parsed.data,{status:upstream.status,headers:responseHeaders(upstream)}):Response.json({code:'CHAT_INVALID_RESPONSE'},{status:502})
  }catch{return Response.json({code:'CHAT_UNAVAILABLE'},{status:503})}
}
