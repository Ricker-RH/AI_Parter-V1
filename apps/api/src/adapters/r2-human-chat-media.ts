import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import {parseBuffer} from 'music-metadata'
import type {HumanMediaReservation} from '@aifans/db'
import type {HumanMediaAttachment} from '@aifans/contracts'
import type {HumanChatMediaStorage} from '../ports/human-chat-media.js'
export type R2HumanChatMediaEnvironment={endpoint:string;bucket:string;accessKeyId:string;secretAccessKey:string}
type Driver={
 read(input:{bucket:string;key:string}):Promise<unknown|null>
 write(input:{bucket:string;key:string;body:Uint8Array;contentType:string;cacheControl:string;ifNoneMatch:'*'}):Promise<void>
 signPut(input:{bucket:string;key:string;contentType:string;contentLength:number;expiresIn:number}):Promise<string>
 signGet(input:{bucket:string;key:string;contentType:string;expiresIn:number}):Promise<string>
 now?:()=>Date
}
const MAX=10485760 as const
function invalid():never{throw new Error('HUMAN_MEDIA_INVALID')}
function validate(input:HumanMediaReservation){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
 if(!uuid.test(input.ownerProfileId)||!uuid.test(input.attachmentId))invalid()
 const base=`private/human-chat/${input.ownerProfileId}/${input.attachmentId}`
 if(input.stagingObjectKey!==`${base}/staging`||input.finalObjectKey!==`${base}/final`||!Number.isInteger(input.sizeBytes)||input.sizeBytes<1||input.sizeBytes>MAX)invalid()
 if(input.kind==='image'?!['image/jpeg','image/png','image/webp'].includes(input.contentType):!['audio/webm','audio/mp4'].includes(input.contentType))invalid()
}
async function collect(body:unknown):Promise<Buffer>{
 if(body instanceof Uint8Array){if(body.byteLength>MAX)invalid();return Buffer.from(body)}
 if(!body||typeof body!=='object'||!(Symbol.asyncIterator in body))invalid()
 const chunks:Buffer[]=[];let length=0
 for await(const chunk of body as AsyncIterable<unknown>){if(!(chunk instanceof Uint8Array))invalid();length+=chunk.byteLength;if(length>MAX)invalid();chunks.push(Buffer.from(chunk))}
 return Buffer.concat(chunks,length)
}
function status(error:unknown){return (error as {$metadata?:{httpStatusCode?:number}})?.$metadata?.httpStatusCode}
function aws(config:R2HumanChatMediaEnvironment):Driver{
 const client=new S3Client({region:'auto',endpoint:config.endpoint,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey}})
 return {
  async read({bucket,key}){try{return (await client.send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)})).Body??null}catch(e){if(status(e)===404)return null;throw e}},
  async write(x){await client.send(new PutObjectCommand({Bucket:x.bucket,Key:x.key,Body:x.body,ContentType:x.contentType,CacheControl:x.cacheControl,IfNoneMatch:x.ifNoneMatch}),{abortSignal:AbortSignal.timeout(15000)})},
  signPut:x=>getSignedUrl(client,new PutObjectCommand({Bucket:x.bucket,Key:x.key,ContentType:x.contentType,ContentLength:x.contentLength}),{expiresIn:x.expiresIn}),
  signGet:x=>getSignedUrl(client,new GetObjectCommand({Bucket:x.bucket,Key:x.key,ResponseContentType:x.contentType,ResponseCacheControl:'private, no-store',ResponseContentDisposition:'inline'}),{expiresIn:x.expiresIn}),
 }
}
type Verified=Omit<HumanMediaAttachment,'attachmentId'|'kind'>
async function verify(source:Buffer,kind:'image'|'voice',contentType:string,normalize:boolean):Promise<{body:Buffer;verified:Verified}>{
 if(source.length<1||source.length>MAX)invalid()
 try{
  if(kind==='image'){
   const metadata=await sharp(source,{failOn:'warning',limitInputPixels:40000000}).metadata()
   const formats:Record<string,string>={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'}
   if(metadata.format!==formats[contentType]||!metadata.width||!metadata.height||metadata.width>12000||metadata.height>12000||(metadata.pages??1)>1)invalid()
   // Full decode/re-encode removes active payloads, metadata and EXIF location.
   const result=await sharp(source,{failOn:'warning',limitInputPixels:40000000}).rotate().webp().toBuffer({resolveWithObject:true})
   if(result.data.length>MAX)invalid()
   return {body:normalize?result.data:source,verified:{contentType:'image/webp',sizeBytes:normalize?result.data.length:source.length,width:result.info.width,height:result.info.height}}
  }
  if(contentType==='audio/webm'){
   if(source.length<12||source.readUInt32BE(0)!==0x1a45dfa3)invalid()
  }else if(contentType==='audio/mp4'){
   if(source.length<16||source.toString('ascii',4,8)!=='ftyp')invalid()
  }else invalid()
  const {format}=await parseBuffer(source,undefined,{duration:true,skipCovers:true})
  if(contentType==='audio/webm'){
   if(format.container!=='EBML/webm'||format.codec!=='OPUS'||!format.trackInfo?.length||format.trackInfo.some(t=>t.type!==2||t.codecName!=='OPUS'))invalid()
  }else if(!format.container?.includes('M4A')&&!format.container?.includes('isom')&&!format.container?.includes('mp42')&&!format.container?.includes('mp41'))invalid()
  if(contentType==='audio/mp4'&&(!format.codec?.includes('AAC')||format.hasVideo||!format.trackInfo?.length||format.trackInfo.some(t=>t.type!==2||!t.codecName?.includes('AAC'))))invalid()
  if(!format.numberOfChannels||format.numberOfChannels>2||!format.sampleRate||format.sampleRate>96000)invalid()
  const durationMs=format.duration===undefined?undefined:Math.ceil(format.duration*1000)
  if(durationMs!==undefined&&(!Number.isFinite(durationMs)||durationMs<1||durationMs>60000))invalid()
  // Native MediaRecorder WebM may omit duration. Do not fabricate a server
  // duration guarantee: client recording is 60s bounded, server bytes are hard capped.
  return {body:source,verified:{contentType:contentType as 'audio/webm'|'audio/mp4',sizeBytes:source.length,...(durationMs===undefined?{}:{durationMs})}}
 }catch{invalid()}
}
export function createR2HumanChatMediaStorage(config:R2HumanChatMediaEnvironment,dependencies?:Driver):HumanChatMediaStorage{
 const driver=dependencies??aws(config),now=driver.now??(()=>new Date())
 async function safe<T>(run:()=>Promise<T>):Promise<T>{try{return await run()}catch(e){if(e instanceof Error&&e.message==='HUMAN_MEDIA_INVALID')throw e;throw new Error('HUMAN_MEDIA_STORAGE_UNAVAILABLE')}}
 return {
  async createUpload(input){validate(input);const expiresIn=Math.ceil((Date.parse(input.expiresAt)-now().getTime())/1000);if(!Number.isInteger(expiresIn)||expiresIn<1||expiresIn>600)invalid();return safe(async()=>({method:'PUT',url:await driver.signPut({bucket:config.bucket,key:input.stagingObjectKey,contentType:input.contentType,contentLength:input.sizeBytes,expiresIn}),headers:{'content-type':input.contentType},expiresAt:input.expiresAt,maxBytes:MAX}))},
  async finalize(input){validate(input);return safe(async()=>{
   const existing=await driver.read({bucket:config.bucket,key:input.finalObjectKey})
   if(existing!==null)return (await verify(await collect(existing),input.kind,input.kind==='image'?'image/webp':input.contentType,false)).verified
   const uploaded=await driver.read({bucket:config.bucket,key:input.stagingObjectKey})
   if(uploaded===null)invalid()
   const source=await collect(uploaded);if(source.length!==input.sizeBytes)invalid()
   const {body,verified}=await verify(source,input.kind,input.contentType,true)
   try{await driver.write({bucket:config.bucket,key:input.finalObjectKey,body,contentType:verified.contentType,cacheControl:'private, no-store',ifNoneMatch:'*'})}
   catch(e){if(status(e)!==412)throw e;const winner=await driver.read({bucket:config.bucket,key:input.finalObjectKey});if(winner===null)throw e;return (await verify(await collect(winner),input.kind,input.kind==='image'?'image/webp':input.contentType,false)).verified}
   return verified
  })},
  async download(input){validate(input);if(!input.attachment)invalid();return safe(async()=>({url:await driver.signGet({bucket:config.bucket,key:input.finalObjectKey,contentType:input.attachment!.contentType,expiresIn:60}),expiresAt:new Date(now().getTime()+60000).toISOString()}))},
 }
}
