import {fetchAifansApi} from '../../../../lib/server-api'

type RouteContext={params:Promise<{path:string[]}>}
type Method='GET'|'POST'|'PATCH'|'DELETE'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BODY_LIMIT=65_536

function creatorPath(parts:string[],method:Method):string|null {
  const [a,b,c,d,e]=parts
  if(a==='admin') {
    if(method==='GET'&&parts.length===2&&(b==='submissions'||b==='requests')) return `admin/creator/${b}`
    if(parts.length===3&&(b==='submissions'||b==='requests')&&uuid.test(c??'')&&method==='GET') return `admin/creator/${b}/${c}`
    if(parts.length===4&&(b==='submissions'||b==='requests')&&uuid.test(c??'')&&d==='decision'&&method==='POST') return `admin/creator/${b}/${c}/decision`
    return null
  }
  if(a==='public'&&b==='profiles'&&uuid.test(c??'')&&parts.length===3&&method==='GET')return `profiles/${c}`
  if(parts.length===1&&['drafts','submissions','ips','requests'].includes(a??'')&&((method==='GET')||(a==='drafts'&&method==='POST'))) return `creator/${a}`
  if(parts.length===2&&['drafts','submissions','ips','requests'].includes(a??'')&&uuid.test(b??'')&&((method==='GET')||(a==='drafts'&&(method==='PATCH'||method==='DELETE')))) return `creator/${a}/${b}`
  if(a==='drafts'&&uuid.test(b??'')) {
    if(parts.length===3&&['submit','generation-intent'].includes(c??'')&&method==='POST') return `creator/drafts/${b}/${c}`
    if(parts.length===3&&c==='references'&&method==='POST') return `creator/drafts/${b}/references`
    if(parts.length===4&&c==='references'&&d==='upload-intent'&&method==='POST') return `creator/drafts/${b}/references/upload-intent`
    if(parts.length===5&&c==='references'&&uuid.test(d??'')&&e==='read-intent'&&method==='GET') return `creator/drafts/${b}/references/${d}/read-intent`
  }
  if(a==='ips'&&uuid.test(b??'')) {
    if(parts.length===3&&c==='analytics'&&method==='GET') return `creator/ips/${b}/analytics`
    if(parts.length===3&&c==='requests'&&method==='POST') return `creator/ips/${b}/requests`
  }
  return null
}

function safeQuery(request:Request,method:Method):string|null {
  const values=new URL(request.url).searchParams
  if(!values.size)return''
  if(method!=='GET')return null
  for(const key of values.keys())if(!['limit','cursor'].includes(key)||values.getAll(key).length!==1)return null
  return `?${values.toString()}`
}
function sameOrigin(request:Request){const origin=request.headers.get('origin');return origin!==null&&origin===new URL(request.url).origin}
function duplicateTopLevelKey(text:string){const keys=new Set<string>();let depth=0;for(let i=0;i<text.length;i++){if(text[i]==='"'){const start=i;for(i++;i<text.length;i++){if(text[i]==='\\')i++;else if(text[i]==='"')break}if(depth===1){let after=i+1;while(/\s/.test(text[after]??''))after++;if(text[after]===':'){try{const key=JSON.parse(text.slice(start,i+1));if(typeof key==='string'){if(keys.has(key))return true;keys.add(key)}}catch{return true}}}}else if(text[i]==='{')depth++;else if(text[i]==='}')depth--}return false}
async function boundedBody(request:Request){if(!request.body)return'';const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>BODY_LIMIT){await reader.cancel();throw new Error('BODY_TOO_LARGE')}chunks.push(value)}}}finally{reader.releaseLock()}const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(joined)}

async function proxy(request:Request,context:RouteContext,method:Method){
  if(method!=='GET'&&!sameOrigin(request))return Response.json({code:'CSRF_REJECTED'},{status:403})
  const path=creatorPath((await context.params).path,method);const query=safeQuery(request,method)
  if(!path||query===null)return new Response(null,{status:404})
  let body:string|undefined
  if(method==='POST'||method==='PATCH'){
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return Response.json({code:'INVALID_REQUEST'},{status:422})
    const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>BODY_LIMIT))return Response.json({code:'PAYLOAD_TOO_LARGE'},{status:413})
    try{body=await boundedBody(request)}catch{return Response.json({code:'PAYLOAD_TOO_LARGE'},{status:413})}
    if(!body.trim()||duplicateTopLevelKey(body))return Response.json({code:'INVALID_REQUEST'},{status:422})
  }
  try{
    const upstream=await fetchAifansApi(`/v1/${path}${query}`,{requestInit:{method,headers:request.headers,...(body===undefined?{}:{body})}})
    const headers:Record<string,string>={'content-type':upstream.headers.get('content-type')??'application/json'};const requestId=upstream.headers.get('x-request-id');if(requestId)headers['x-request-id']=requestId
    return new Response(await upstream.arrayBuffer(),{status:upstream.status,headers})
  }catch{return Response.json({code:'CREATOR_UNAVAILABLE'},{status:503})}
}
export function GET(request:Request,context:RouteContext){return proxy(request,context,'GET')}
export function POST(request:Request,context:RouteContext){return proxy(request,context,'POST')}
export function PATCH(request:Request,context:RouteContext){return proxy(request,context,'PATCH')}
export function DELETE(request:Request,context:RouteContext){return proxy(request,context,'DELETE')}
