import {fetchAifansApi} from '../../../../lib/server-api'
import {cancelBody,mime,readJsonBody,sameOrigin,upstreamError} from '../../../../lib/chat-proxy'
const headers={'cache-control':'private, no-store'}
const fail=(code:string,status:number)=>Response.json({code},{status,headers})
export async function POST(request:Request){
 if(!sameOrigin(request)||request.headers.get('origin')!==new URL(request.url).origin){await cancelBody(request);return fail('CSRF_REJECTED',403)}
 if(new URL(request.url).search||!mime(request,'application/json')){await cancelBody(request);return fail('INVALID_REQUEST',422)}
 const read=await readJsonBody(request);if(read.kind!=='ok')return fail('INVALID_REQUEST',422)
 try{const value:unknown=JSON.parse(read.text);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length)return fail('INVALID_REQUEST',422)}catch{return fail('INVALID_REQUEST',422)}
 try{
  const response=await fetchAifansApi('/v1/realtime/revoke',{policy:'live-no-store',trustedClientHeaders:request.headers,requestInit:{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:request.signal}})
  if(!response.ok)return upstreamError(response)
  const value:unknown=await response.json()
  if(!value||typeof value!=='object'||Object.keys(value).length!==1||!('revoked'in value)||typeof value.revoked!=='number'||!Number.isSafeInteger(value.revoked)||value.revoked<0||value.revoked>2147483647)throw Error()
  return Response.json(value,{headers})
 }catch{return fail('REALTIME_REVOCATION_UNAVAILABLE',503)}
}
