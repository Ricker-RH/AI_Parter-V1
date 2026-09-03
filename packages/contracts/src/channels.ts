import {z} from 'zod'
import {FeedPageSchema,PublicIpSchema} from './social.js'

const uuid=z.uuid()
const dateTime=z.iso.datetime()
const normalizedText=(max:number)=>z.string().trim().transform(value=>value.replace(/\s+/g,' ')).pipe(z.string().min(1).max(max))
export const ChannelImageObjectKeySchema=z.string().regex(/^public\/channels\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i)
const publicHttpsUrl=z.url().refine(value=>value.startsWith('https://'))

export const ChannelSlugSchema=z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const ChannelStatusSchema=z.enum(['draft','published','archived'])
export const ChannelQuerySchema=z.strictObject({
  q:normalizedText(80).optional(),
  limit:z.coerce.number().int().min(1).max(50).default(20),
  cursor:z.string().min(1).max(2048).optional(),
})
export const ChannelPageQuerySchema=z.strictObject({
  limit:z.coerce.number().int().min(1).max(50).default(20),
  cursor:z.string().min(1).max(2048).optional(),
})
export const ChannelSummarySchema=z.strictObject({
  id:uuid,
  slug:ChannelSlugSchema,
  name:z.string().min(1).max(80),
  description:z.string().max(280),
  imageUrl:publicHttpsUrl.nullable(),
  ipCount:z.number().int().nonnegative(),
})
export const ChannelPageSchema=z.strictObject({items:z.array(ChannelSummarySchema),nextCursor:z.string().nullable()})
export const ChannelDetailSchema=ChannelSummarySchema.extend({recommendedIps:z.array(PublicIpSchema)}).strict()
export const ChannelIpPageSchema=z.strictObject({items:z.array(PublicIpSchema),nextCursor:z.string().nullable()})
export const ChannelPostPageSchema=FeedPageSchema

export const ChannelDirectoryCursorSchema=z.strictObject({
  v:z.literal(1),kind:z.literal('channel_directory'),query:z.string().max(80),rank:z.number().finite(),sortOrder:z.number().int(),id:uuid,
})
export const ChannelIpCursorSchema=z.strictObject({
  v:z.literal(1),kind:z.literal('channel_ips'),channelId:uuid,curationWeight:z.number().int(),feedWeight:z.number().int(),latestPublishedAt:dateTime.nullable(),profileId:uuid,
})
export const ChannelPostCursorSchema=z.strictObject({
  v:z.literal(1),kind:z.literal('channel_posts'),channelId:uuid,publishedAt:dateTime,id:uuid,
})
export const AdminChannelCursorSchema=z.strictObject({v:z.literal(1),kind:z.literal('admin_channels'),query:z.string().max(80),status:ChannelStatusSchema.nullable(),sortOrder:z.number().int(),updatedAt:dateTime,id:uuid})
export const ChannelCursorSchema=z.discriminatedUnion('kind',[ChannelDirectoryCursorSchema,ChannelIpCursorSchema,ChannelPostCursorSchema,AdminChannelCursorSchema])

const base64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function bytesToBase64(value:string):string{
  const encoded=encodeURIComponent(value);const bytes:number[]=[]
  for(let index=0;index<encoded.length;){if(encoded[index]==='%'){bytes.push(Number.parseInt(encoded.slice(index+1,index+3),16));index+=3}else{bytes.push(encoded.charCodeAt(index));index+=1}}
  let output=''
  for(let index=0;index<bytes.length;index+=3){const a=bytes[index]!;const b=bytes[index+1];const c=bytes[index+2];output+=base64[a>>2]!+base64[((a&3)<<4)|((b??0)>>4)]!+(b===undefined?'':base64[((b&15)<<2)|((c??0)>>6)]!)+(c===undefined?'':base64[c&63]!)}
  return output.replaceAll('+','-').replaceAll('/','_')
}
function base64ToText(value:string):string{
  const normalized=value.replaceAll('-','+').replaceAll('_','/');const bytes:number[]=[]
  for(let index=0;index<normalized.length;index+=4){const a=base64.indexOf(normalized[index]!);const b=base64.indexOf(normalized[index+1]!);const c=normalized[index+2]?base64.indexOf(normalized[index+2]!):0;const d=normalized[index+3]?base64.indexOf(normalized[index+3]!):0;if(a<0||b<0||c<0||d<0)throw new Error();bytes.push((a<<2)|(b>>4));if(index+2<normalized.length)bytes.push(((b&15)<<4)|(c>>2));if(index+3<normalized.length)bytes.push(((c&3)<<6)|d)}
  return decodeURIComponent(bytes.map(byte=>`%${byte.toString(16).padStart(2,'0')}`).join(''))
}
export type ChannelCursor=z.infer<typeof ChannelCursorSchema>
export function encodeChannelCursor(cursor:ChannelCursor):string{return bytesToBase64(JSON.stringify(ChannelCursorSchema.parse(cursor)))}
export function decodeChannelCursor(value:string,expectedKind?:ChannelCursor['kind']):ChannelCursor{
  try{
    if(value.length>2048||value.length%4===1||!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error()
    const json=base64ToText(value)
    if(bytesToBase64(json)!==value) throw new Error()
    const keys=[...json.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(match=>JSON.parse(`"${match[1]}"`) as string)
    if(new Set(keys).size!==keys.length) throw new Error()
    const cursor=ChannelCursorSchema.parse(JSON.parse(json))
    if(expectedKind&&cursor.kind!==expectedKind) throw new Error()
    return cursor
  }catch{throw new Error('INVALID_CURSOR')}
}

export const CreateChannelSchema=z.strictObject({
  slug:ChannelSlugSchema,name:normalizedText(80),description:z.string().trim().max(280).default(''),imageObjectKey:ChannelImageObjectKeySchema.nullable().optional(),sortOrder:z.number().int().default(0),
})
export const UpdateChannelSchema=z.strictObject({
  name:normalizedText(80).optional(),description:z.string().trim().max(280).optional(),imageObjectKey:ChannelImageObjectKeySchema.nullable().optional(),sortOrder:z.number().int().optional(),
}).refine(value=>Object.keys(value).length>0,{message:'At least one field is required'})
export const ReplaceChannelAliasesSchema=z.strictObject({aliases:z.array(normalizedText(80)).max(50)}).superRefine((value,context)=>{
  const seen=new Set<string>()
  value.aliases.forEach((alias,index)=>{const normalized=alias.toLocaleLowerCase();if(seen.has(normalized))context.addIssue({code:'custom',path:['aliases',index],message:'Duplicate alias'});seen.add(normalized)})
})
export const SetChannelMembershipSchema=z.strictObject({ipProfileId:uuid,isPrimary:z.boolean().default(false),curationWeight:z.number().int().default(0)})
export const ChannelRecordSchema=ChannelSummarySchema.extend({status:ChannelStatusSchema,sortOrder:z.number().int(),aliases:z.array(z.string()),createdAt:dateTime,updatedAt:dateTime}).strict()
export const AdminChannelQuerySchema=z.strictObject({q:normalizedText(80).optional(),status:ChannelStatusSchema.optional(),limit:z.coerce.number().int().min(1).max(50).default(25),cursor:z.string().min(1).max(2048).optional()})
export const AdminChannelPageSchema=z.strictObject({items:z.array(ChannelRecordSchema),nextCursor:z.string().nullable()})

export type ChannelStatus=z.infer<typeof ChannelStatusSchema>
export type ChannelQuery=z.infer<typeof ChannelQuerySchema>
export type ChannelPageQuery=z.infer<typeof ChannelPageQuerySchema>
export type ChannelSummary=z.infer<typeof ChannelSummarySchema>
export type ChannelPage=z.infer<typeof ChannelPageSchema>
export type ChannelDetail=z.infer<typeof ChannelDetailSchema>
export type ChannelIpPage=z.infer<typeof ChannelIpPageSchema>
export type CreateChannel=z.infer<typeof CreateChannelSchema>
export type UpdateChannel=z.infer<typeof UpdateChannelSchema>
export type ReplaceChannelAliases=z.infer<typeof ReplaceChannelAliasesSchema>
export type SetChannelMembership=z.infer<typeof SetChannelMembershipSchema>
export type ChannelRecord=z.infer<typeof ChannelRecordSchema>
export type AdminChannelQuery=z.infer<typeof AdminChannelQuerySchema>
export type AdminChannelPage=z.infer<typeof AdminChannelPageSchema>
