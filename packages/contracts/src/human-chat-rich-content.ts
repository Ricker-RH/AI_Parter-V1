import {z} from 'zod'
// Unicode characters rendered by the platform font, no bundled third-party art.
export const HUMAN_CHAT_STICKERS=[
 {id:'wave',glyph:'👋',label:{en:'Wave','zh-CN':'挥手'}},
 {id:'heart',glyph:'💖',label:{en:'Heart','zh-CN':'爱心'}},
 {id:'party',glyph:'🎉',label:{en:'Celebrate','zh-CN':'庆祝'}},
 {id:'thanks',glyph:'🙏',label:{en:'Thanks','zh-CN':'谢谢'}},
 {id:'wow',glyph:'🤩',label:{en:'Wow','zh-CN':'惊喜'}},
 {id:'hug',glyph:'🫂',label:{en:'Hug','zh-CN':'拥抱'}},
] as const
export const HumanStickerIdSchema=z.enum(['wave','heart','party','thanks','wow','hug'])
export const HumanShareTargetSchema=z.strictObject({kind:z.enum(['post','human','ip']),id:z.uuid()})
export const HumanShareCardSchema=z.strictObject({target:HumanShareTargetSchema,title:z.string().min(1).max(160),subtitle:z.string().max(160)})
export const HumanShareTargetQuerySchema=z.strictObject({kind:HumanShareTargetSchema.shape.kind,q:z.string().trim().max(80).default(''),limit:z.number().int().min(1).max(20).default(10)})
export const HumanShareTargetPageSchema=z.strictObject({items:z.array(HumanShareCardSchema).max(20)})
export const HumanShareRecipientSchema=z.strictObject({id:z.uuid(),displayName:z.string().min(1).max(160),avatarUrl:z.url().nullable()})
export const HumanShareRecipientPageSchema=z.strictObject({items:z.array(HumanShareRecipientSchema).max(20)})
export const HumanShareResolutionSchema=z.discriminatedUnion('state',[z.strictObject({state:z.literal('available'),card:HumanShareCardSchema}),z.strictObject({state:z.literal('unavailable')})])
export type HumanShareTarget=z.infer<typeof HumanShareTargetSchema>
export type HumanShareCard=z.infer<typeof HumanShareCardSchema>
export type HumanShareTargetQuery=z.infer<typeof HumanShareTargetQuerySchema>
export type HumanShareTargetPage=z.infer<typeof HumanShareTargetPageSchema>
export type HumanShareRecipient=z.infer<typeof HumanShareRecipientSchema>
export type HumanShareRecipientPage=z.infer<typeof HumanShareRecipientPageSchema>
export type HumanShareResolution=z.infer<typeof HumanShareResolutionSchema>
