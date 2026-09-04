import {HumanProfileSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../../lib/server-api'
import {mime, readJsonBody, sameOrigin, uuid, upstreamError} from '../../../../lib/chat-proxy'

type Context={params:Promise<{path:string[]}>}
const headers={'cache-control':'private, no-store'}
const error=(code:string,status:number)=>Response.json({code},{status,headers})
function isObject(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)}
async function proxy(request:Request,context:Context,method:'GET'|'PUT'|'DELETE'){
 if(method!=='GET'&&!sameOrigin(request))return error('CSRF_REJECTED',403)
 if(new URL(request.url).search)return error('INVALID_REQUEST',400)
 const {path}=await context.params
 if(!uuid.test(path[0]??'')||!(method==='GET'?path.length===1:path.length===2&&(path[1]==='follow'||path[1]==='block')))return error('NOT_FOUND',404)
 if(method!=='GET'){
  if(!mime(request,'application/json'))return error('INVALID_REQUEST',422)
  const read=await readJsonBody(request)
  if(read.kind!=='ok')return error(read.kind==='too-large'?'PAYLOAD_TOO_LARGE':'INVALID_REQUEST',read.kind==='too-large'?413:422)
  try{const value:unknown=JSON.parse(read.text);if(!isObject(value)||Object.keys(value).length!==0)return error('INVALID_REQUEST',422)}catch{return error('INVALID_REQUEST',422)}
 }
 try{
  const upstream=await fetchAifansApi(`/v1/humans/${path.join('/')}`,{policy:'live-no-store',trustedClientHeaders:request.headers,requestInit:{method,...(method==='GET'?{}:{headers:{'content-type':'application/json'},body:'{}'})}})
  if(!upstream.ok){const result=await upstreamError(upstream);result.headers.set('cache-control','private, no-store');return result}
  if(upstream.status!==200)return error('HUMAN_INVALID_RESPONSE',502)
  let body:unknown
  try{body=await upstream.json()}catch{return error('HUMAN_INVALID_RESPONSE',502)}
  const parsed=method==='GET'?HumanProfileSchema.safeParse(body):{success:isObject(body)&&Object.keys(body).length===1&&typeof body.changed==='boolean',data:body}
  if(!parsed.success)return error('HUMAN_INVALID_RESPONSE',502)
  return Response.json(parsed.data,{headers})
 }catch{return error('HUMAN_UNAVAILABLE',503)}
}
export const GET=(request:Request,context:Context)=>proxy(request,context,'GET')
export const PUT=(request:Request,context:Context)=>proxy(request,context,'PUT')
export const DELETE=(request:Request,context:Context)=>proxy(request,context,'DELETE')
