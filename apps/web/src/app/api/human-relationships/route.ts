import {HumanRelationshipBatchInputSchema,HumanRelationshipBatchSchema} from '@aifans/contracts'
import {fetchAifansApi} from '../../../lib/server-api'
import {mime,readJsonBody,sameOrigin,upstreamError} from '../../../lib/chat-proxy'
const headers={'cache-control':'private, no-store'}
const fail=(code:string,status:number)=>Response.json({code},{status,headers})
export async function POST(request:Request){
 if(!sameOrigin(request))return fail('CSRF_REJECTED',403)
 if(new URL(request.url).search||!mime(request,'application/json'))return fail('INVALID_REQUEST',400)
 const read=await readJsonBody(request)
 if(read.kind!=='ok')return fail('INVALID_REQUEST',400)
 try{
  const input=HumanRelationshipBatchInputSchema.safeParse(JSON.parse(read.text))
  if(!input.success)return fail('INVALID_REQUEST',400)
  const response=await fetchAifansApi('/v1/human-relationships',{policy:'live-no-store',trustedClientHeaders:request.headers,requestInit:{method:'POST',body:JSON.stringify(input.data),headers:{'content-type':'application/json'}}})
  if(!response.ok)return upstreamError(response)
  const output=HumanRelationshipBatchSchema.parse(await response.json())
  if(output.items.some(item=>!input.data.profileIds.includes(item.profileId)))throw Error()
  return Response.json(output,{headers})
 }catch{return fail('HUMAN_UNAVAILABLE',503)}
}
