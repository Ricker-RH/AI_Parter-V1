import {describe,it,expect,vi} from 'vitest'
import sharp from 'sharp'
import {createR2HumanChatMediaStorage} from './r2-human-chat-media.js'
const owner='edc5b166-125d-4af3-ac8c-233a773f66c1',id='edc5b166-125d-4af3-ac8c-233a773f66c2'
const config={endpoint:'https://r2.example.test',bucket:'private',accessKeyId:'a',secretAccessKey:'b'}
const input={attachmentId:id,ownerProfileId:owner,peerProfileId:owner,conversationId:id,kind:'image' as const,contentType:'image/png' as const,sizeBytes:1,expiresAt:'2026-09-04T10:10:00.000Z',stagingObjectKey:`private/human-chat/${owner}/${id}/staging`,finalObjectKey:`private/human-chat/${owner}/${id}/final`,attachment:null}
function setup(bytes:Uint8Array){
 const objects=new Map<string,Uint8Array>([[input.stagingObjectKey,bytes]])
 const driver={read:vi.fn(async({key}:{key:string})=>objects.get(key)??null),write:vi.fn(async({key,body}:{key:string;body:Uint8Array})=>{objects.set(key,body)}),signPut:vi.fn(async()=> 'https://r2.example.test/upload'),signGet:vi.fn(async()=> 'https://r2.example.test/download'),now:()=>new Date('2026-09-04T10:00:00Z')}
 return {driver,storage:createR2HumanChatMediaStorage(config,driver)}
}
describe('private human chat R2 verification',()=>{
 it('decodes and strips image metadata into immutable private final object',async()=>{
  const bytes=await sharp({create:{width:20,height:15,channels:3,background:'#ff0000'}}).png().toBuffer()
  const {storage,driver}=setup(bytes)
  const verified=await storage.finalize({...input,sizeBytes:bytes.length})
  expect(verified).toMatchObject({contentType:'image/webp',width:20,height:15})
  expect(driver.write).toHaveBeenCalledWith(expect.objectContaining({key:input.finalObjectKey,ifNoneMatch:'*',cacheControl:'private, no-store',contentType:'image/webp'}))
  expect(await storage.finalize({...input,sizeBytes:bytes.length})).toEqual(verified)
 })
 it('rejects forged size, MIME and invalid content without a final write',async()=>{
  const bytes=await sharp({create:{width:20,height:15,channels:3,background:'#ff0000'}}).png().toBuffer()
  const {storage,driver}=setup(bytes)
  await expect(storage.finalize(input)).rejects.toThrow('HUMAN_MEDIA_INVALID')
  await expect(storage.finalize({...input,contentType:'image/jpeg',sizeBytes:bytes.length})).rejects.toThrow('HUMAN_MEDIA_INVALID')
  const invalid=setup(new Uint8Array([1,2,3]))
  await expect(invalid.storage.finalize({...input,sizeBytes:3})).rejects.toThrow('HUMAN_MEDIA_INVALID')
  expect(driver.write).not.toHaveBeenCalled()
 })
 it('binds server-only keys and signs short private reads and bounded PUTs',async()=>{
  const {storage,driver}=setup(new Uint8Array())
  expect(await storage.createUpload(input)).toMatchObject({method:'PUT',maxBytes:10485760,headers:{'content-type':'image/png'}})
  expect(driver.signPut).toHaveBeenCalledWith(expect.objectContaining({key:input.stagingObjectKey,contentLength:1,expiresIn:600}))
  await storage.download({...input,attachment:{attachmentId:id,kind:'image',contentType:'image/webp',sizeBytes:10,width:1,height:1}})
  expect(driver.signGet).toHaveBeenCalledWith(expect.objectContaining({key:input.finalObjectKey,expiresIn:60}))
  await expect(storage.createUpload({...input,stagingObjectKey:'public/forged'})).rejects.toThrow('HUMAN_MEDIA_INVALID')
 })
 it('rejects arbitrary bytes mislabeled voice and oversized reads',async()=>{
  const {storage,driver}=setup(new Uint8Array([1,2,3]))
  await expect(storage.finalize({...input,kind:'voice',contentType:'audio/webm',sizeBytes:3})).rejects.toThrow('HUMAN_MEDIA_INVALID')
  const oversized=setup(new Uint8Array(10485761))
  await expect(oversized.storage.finalize({...input,sizeBytes:10485760})).rejects.toThrow('HUMAN_MEDIA_INVALID')
  expect(driver.write).not.toHaveBeenCalled()
 })
})
