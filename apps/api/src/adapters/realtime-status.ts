import {z} from 'zod'
export function createRealtimeStatusReader(options:{baseUrl:string;secret:string;fetcher?:typeof fetch}) {
 try {const url=new URL(options.baseUrl);if(url.protocol!=='https:'||url.origin!==options.baseUrl||options.secret.length<32||options.secret.trim()!==options.secret)throw new Error()} catch {throw new Error('Invalid realtime status configuration')}
 return async(profileId:string,conversationId:string):Promise<boolean>=>{
  z.uuid().parse(profileId);z.uuid().parse(conversationId)
  try {
   const response=await(options.fetcher??fetch)(`${options.baseUrl}/internal/status/${profileId}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{authorization:`Bearer ${options.secret}`,'content-type':'application/json'},body:JSON.stringify({conversationId})})
   if(!response.ok||!response.body) {await response.body?.cancel();throw new Error()}
   const reader=response.body.getReader();let text='';let bytes=0;const decoder=new TextDecoder('utf-8',{fatal:true})
   try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048)throw new Error();text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel()}
   return z.strictObject({online:z.boolean()}).parse(JSON.parse(text)).online
  }catch {throw new Error('Realtime status unavailable')}
 }
}
