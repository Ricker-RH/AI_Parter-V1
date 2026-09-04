import {HumanPreferencesUpdateInputSchema} from '@aifans/contracts'
import {duplicateTopLevelKey,mime,readJsonBody,sameOrigin,upstreamError} from '../../../lib/chat-proxy'
import {fetchAifansApi} from '../../../lib/server-api'
import {parseHumanPreferences} from '../../../lib/human-preferences'
const headers={'cache-control':'private, no-store'}
const error=(code:string,status:number)=>Response.json({code},{status,headers})
async function proxy(request:Request,method:'GET'|'PATCH'){
 if(method==='PATCH'&&!sameOrigin(request))return error('CSRF_REJECTED',403)
 if(new URL(request.url).search)return error('INVALID_REQUEST',400)
 let body:string|undefined
 if(method==='PATCH'){
  if(!mime(request,'application/json'))return error('INVALID_REQUEST',422)
  const read=await readJsonBody(request)
  if(read.kind!=='ok')return error(read.kind==='too-large'?'PAYLOAD_TOO_LARGE':'INVALID_REQUEST',read.kind==='too-large'?413:422)
  if(duplicateTopLevelKey(read.text))return error('INVALID_REQUEST',422)
  try{const parsed=HumanPreferencesUpdateInputSchema.safeParse(JSON.parse(read.text));if(!parsed.success)return error('INVALID_REQUEST',422);body=JSON.stringify(parsed.data)}catch{return error('INVALID_REQUEST',422)}
 }
 try{
  const upstream=await fetchAifansApi('/v1/human-preferences',{policy:'live-no-store',trustedClientHeaders:request.headers,requestInit:{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body})}})
  if(!upstream.ok){const response=await upstreamError(upstream);response.headers.set('cache-control','private, no-store');return response}
  if(upstream.status!==200)return error('HUMAN_INVALID_RESPONSE',502)
  let value:unknown;try{value=await upstream.json()}catch{return error('HUMAN_INVALID_RESPONSE',502)}
  const parsed=parseHumanPreferences(value)
  return parsed?Response.json(parsed,{headers}):error('HUMAN_INVALID_RESPONSE',502)
 }catch{return error('HUMAN_UNAVAILABLE',503)}
}
export const GET=(request:Request)=>proxy(request,'GET')
export const PATCH=(request:Request)=>proxy(request,'PATCH')
