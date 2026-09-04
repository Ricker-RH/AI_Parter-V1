import {describe,it,expect} from 'vitest'
import {HumanMediaUploadInputSchema,HumanMediaAttachmentSchema} from './human-chat-media.js'
const attachmentId='edc5b166-125d-4af3-ac8c-233a773f66c1'
describe('private human media contracts',()=>{
 it('keeps media input bounded and rejects owner/key/type spoofing',()=>{
  const valid={kind:'image',contentType:'image/png',sizeBytes:10}
  expect(HumanMediaUploadInputSchema.safeParse(valid).success).toBe(true)
  for(const input of [{...valid,sizeBytes:10485761},{...valid,sizeBytes:0},{...valid,ownerProfileId:attachmentId},{...valid,objectKey:'forged'},{...valid,contentType:'audio/webm'},{kind:'voice',contentType:'audio/webm;codecs=opus',sizeBytes:10}])expect(HumanMediaUploadInputSchema.safeParse(input).success).toBe(false)
 })
 it('requires image dimensions and never invents missing voice duration',()=>{
  expect(HumanMediaAttachmentSchema.safeParse({attachmentId,kind:'voice',contentType:'audio/webm',sizeBytes:10}).success).toBe(true)
  expect(HumanMediaAttachmentSchema.safeParse({attachmentId,kind:'image',contentType:'image/webp',sizeBytes:10}).success).toBe(false)
  expect(HumanMediaAttachmentSchema.safeParse({attachmentId,kind:'voice',contentType:'image/webp',sizeBytes:10}).success).toBe(false)
  expect(HumanMediaAttachmentSchema.safeParse({attachmentId,kind:'voice',contentType:'audio/mp4',sizeBytes:10,durationMs:60001}).success).toBe(false)
 })
})
