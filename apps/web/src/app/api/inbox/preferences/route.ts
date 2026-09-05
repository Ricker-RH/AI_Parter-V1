import {InboxPreferenceInputSchema as inputSchema, InboxPreferencesSchema as resultSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../../lib/server-api'
import {sameOrigin, readJsonBody, duplicateTopLevelKey, mime, upstreamError} from '../../../../lib/chat-proxy'
const headers={'Cache-Control':'private, no-store'}
export async function GET(){
 try{const result=await fetchAifansApi('/v1/inbox/preferences',{policy:'live-no-store'});if(!result.ok)return upstreamError(result);const parsed=resultSchema.safeParse(await result.json());return parsed.success?Response.json(parsed.data,{headers}):Response.json({code:'INVALID_RESPONSE'},{status:502,headers})}catch{return Response.json({code:'UNAVAILABLE'},{status:503,headers})}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({code:'CSRF_REJECTED'},{status:403,headers})
 if(!mime(request,'application/json')||new URL(request.url).search)return Response.json({code:'INVALID_REQUEST'},{status:400,headers})
 const body=await readJsonBody(request)
 if(body.kind!=='ok')return Response.json({code:'INVALID_REQUEST'},{status:400,headers})
 try{
  if(duplicateTopLevelKey(body.text))return Response.json({code:'INVALID_REQUEST'},{status:400,headers})
  const input=inputSchema.safeParse(JSON.parse(body.text));if(!input.success)return Response.json({code:'INVALID_REQUEST'},{status:400,headers})
  const result=await fetchAifansApi('/v1/inbox/preferences',{policy:'live-no-store',requestInit:{method:'POST',headers:request.headers,body:JSON.stringify(input.data)},trustedClientHeaders:request.headers})
  if(!result.ok)return upstreamError(result)
  const resultBody=await result.json();if(resultBody?.ok!==true)return Response.json({code:'INVALID_RESPONSE'},{status:502,headers})
  return Response.json({ok:true},{headers})
 }catch{return Response.json({code:'UNAVAILABLE'},{status:503,headers})}
}
