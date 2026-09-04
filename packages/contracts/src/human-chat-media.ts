import {z} from 'zod'
export const HumanMediaUploadInputSchema=z.strictObject({kind:z.enum(['image','voice']),contentType:z.enum(['image/jpeg','image/png','image/webp','audio/webm','audio/mp4']),sizeBytes:z.number().int().min(1).max(10485760)}).refine(x=>x.kind==='image'?x.contentType.startsWith('image/'):x.contentType.startsWith('audio/'))
export const HumanMediaAttachmentSchema=z.strictObject({attachmentId:z.uuid(),kind:z.enum(['image','voice']),contentType:z.enum(['image/webp','audio/webm','audio/mp4']),sizeBytes:z.number().int().min(1).max(10485760),width:z.number().int().min(1).max(12000).optional(),height:z.number().int().min(1).max(12000).optional(),durationMs:z.number().int().min(1).max(60000).optional()}).refine(x=>x.kind==='image'?x.contentType==='image/webp'&&x.width!==undefined&&x.height!==undefined&&x.durationMs===undefined:x.contentType.startsWith('audio/')&&x.width===undefined&&x.height===undefined)
export const HumanMediaUploadSchema=z.strictObject({attachmentId:z.uuid(),upload:z.strictObject({method:z.literal('PUT'),url:z.url({protocol:/^https$/}),headers:z.strictObject({'content-type':HumanMediaUploadInputSchema.shape.contentType}),expiresAt:z.iso.datetime(),maxBytes:z.literal(10485760)})})
export const HumanMediaDownloadSchema=z.strictObject({url:z.url({protocol:/^https$/}),expiresAt:z.iso.datetime(),attachment:HumanMediaAttachmentSchema})
export type HumanMediaUploadInput=z.infer<typeof HumanMediaUploadInputSchema>
export type HumanMediaAttachment=z.infer<typeof HumanMediaAttachmentSchema>
export type HumanMediaUpload=z.infer<typeof HumanMediaUploadSchema>
export type HumanMediaDownload=z.infer<typeof HumanMediaDownloadSchema>
