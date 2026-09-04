import type {Actor,HumanChatMediaRepository,HumanMediaReservation} from '@aifans/db'
import type {HumanMediaUploadInput,HumanMediaAttachment,HumanMediaUpload,HumanMediaDownload} from '@aifans/contracts'
export type HumanChatMediaStorage={
 createUpload(input:HumanMediaReservation):Promise<HumanMediaUpload['upload']>
 finalize(input:HumanMediaReservation):Promise<Omit<HumanMediaAttachment,'attachmentId'|'kind'>>
 download(input:HumanMediaReservation):Promise<{url:string;expiresAt:string}>
}
export type HumanChatMediaPort={
 reserve(actor:Actor,peerProfileId:string,input:HumanMediaUploadInput):Promise<HumanMediaUpload>
 finalize(actor:Actor,attachmentId:string):Promise<HumanMediaAttachment>
 download(actor:Actor,attachmentId:string):Promise<HumanMediaDownload>
}
export function createHumanChatMediaPort({repository,storage}:{repository:HumanChatMediaRepository;storage:HumanChatMediaStorage}):HumanChatMediaPort{
 return {
  async reserve(actor,peer,input){const reservation=await repository.reserve(actor,peer,input);return {attachmentId:reservation.attachmentId,upload:await storage.createUpload(reservation)}},
  async finalize(actor,id){
   const reservation=await repository.get(actor,id)
   if(reservation.attachment)return reservation.attachment
   const verified=await storage.finalize(reservation)
   const result=await repository.confirm(actor,id,verified)
   if(!result.attachment)throw new Error('HUMAN_MEDIA_INVALID')
   return result.attachment
  },
  async download(actor,id){
   const reservation=await repository.get(actor,id,true)
   if(!reservation.attachment)throw new Error('HUMAN_MEDIA_INVALID')
   return {...await storage.download(reservation),attachment:reservation.attachment}
  },
 }
}
