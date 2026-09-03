import {
  AdminChannelPageSchema,ChannelDetailSchema,ChannelIpPageSchema,ChannelPageSchema,ChannelRecordSchema,FeedPageSchema,
  CreateChannelSchema,ReplaceChannelAliasesSchema,SetChannelMembershipSchema,UpdateChannelSchema,
  decodeChannelCursor,encodeChannelCursor,
  type AdminChannelPage,type AdminChannelQuery,type ChannelDetail,type ChannelIpPage,type ChannelPage,type ChannelPageQuery,type ChannelQuery,type ChannelRecord,type ChannelStatus,type CreateChannel,type FeedPage,type PublicIp,type PublicPostMedia,type ReplaceChannelAliases,type SetChannelMembership,type UpdateChannel,
} from '@aifans/contracts'
import {type Actor,type QueryClient,type WithPlatformActor,withPlatformActor} from './session.js'

type PublicSession=<T>(callback:(client:QueryClient)=>Promise<T>)=>Promise<T>
type ChannelRow={id:string;slug:string;name:string;description:string;image_object_key:string|null;ip_count:number|string;sort_order?:number;search_rank?:number|string;status?:ChannelStatus;aliases?:string[];created_at?:Date|string;updated_at?:Date|string}
type IdentityRow={id:string;username:string;display_name:string;bio:string|null;languages:string[];visual_type:'realistic'|'anime'|'hybrid';creator_id:string|null;creator_username:string|null;creator_display_name:string|null}
type IpRow=IdentityRow&{channel_id?:string;curation_weight:number;feed_weight:number;latest_published_at:Date|string|null}
type PostRow=IdentityRow&{channel_id?:string;post_id:string;body:string;language_code:string|null;published_at:Date|string;like_count:number|string;comment_count:number|string;bookmark_count:number|string;share_count:number|string}

export type ChannelRepository={listChannels(query:ChannelQuery):Promise<ChannelPage>;getChannel(slug:string,recommendedLimit?:number):Promise<ChannelDetail|null>;listProfiles(slug:string,page:ChannelPageQuery):Promise<ChannelIpPage>;listPosts(slug:string,page:ChannelPageQuery):Promise<FeedPage>}
export type PlatformChannelRepository={
  listChannels(input:{actor:Actor;query:AdminChannelQuery}):Promise<AdminChannelPage>
  getChannel(input:{actor:Actor;channelId:string}):Promise<ChannelRecord|null>
  createChannel(input:{actor:Actor;requestId:string;channel:CreateChannel}):Promise<ChannelRecord>
  updateChannel(input:{actor:Actor;requestId:string;channelId:string;channel:UpdateChannel}):Promise<ChannelRecord>
  setStatus(input:{actor:Actor;requestId:string;channelId:string;status:ChannelStatus}):Promise<void>
  replaceAliases(input:{actor:Actor;requestId:string;channelId:string;aliases:ReplaceChannelAliases}):Promise<void>
  setMembership(input:{actor:Actor;requestId:string;channelId:string;membership:SetChannelMembership}):Promise<void>
  removeMembership(input:{actor:Actor;requestId:string;channelId:string;ipProfileId:string}):Promise<void>
}

function safeBase(base?:string):string|undefined{if(!base)return undefined;const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('INVALID_PUBLIC_MEDIA_BASE');return base.endsWith('/')?base:`${base}/`}
function imageUrl(key:string|null,base?:string):string|null{if(!key||!base)return null;if(!/^public\/channels\/[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(key))throw new Error('INVALID_PUBLIC_MEDIA_KEY');return new URL(key,safeBase(base)).toString()}
function summary(row:ChannelRow,base?:string){return {id:row.id,slug:row.slug,name:row.name,description:row.description,imageUrl:imageUrl(row.image_object_key,base),ipCount:Number(row.ip_count)}}
function publicIp(row:IdentityRow):PublicIp{const creator=row.creator_id&&row.creator_username&&row.creator_display_name?{id:row.creator_id,username:row.creator_username,displayName:row.creator_display_name}:undefined;return {kind:'ip',id:row.id,username:row.username,displayName:row.display_name,bio:row.bio,languages:row.languages as Array<'en'|'zh-CN'>,visualType:row.visual_type,...(creator?{creator}:{})}}
function iso(value:Date|string){return new Date(value).toISOString()}
function record(row:ChannelRow,base?:string):ChannelRecord{return ChannelRecordSchema.parse({...summary(row,base),status:row.status,sortOrder:row.sort_order,aliases:row.aliases??[],createdAt:iso(row.created_at!),updatedAt:iso(row.updated_at!)})}
async function publicMedia(client:QueryClient,postId:string,base?:string):Promise<PublicPostMedia[]>{if(!base)return [];const result=await client.query<{id:string;object_key:string;alt_text:string|null;width:number|null;height:number|null}>('SELECT id,object_key,alt_text,content_type,width,height FROM public.social_public_post_media($1)',[postId]);return result.rows.map(row=>{if(!/^public\/posts\/[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(row.object_key))throw new Error('INVALID_PUBLIC_MEDIA_KEY');return {id:row.id,type:'image' as const,url:new URL(row.object_key,safeBase(base)).toString(),altText:row.alt_text,width:row.width,height:row.height,aspectRatio:row.width&&row.height?row.width/row.height:null}})}

export function createChannelRepository({withPublic,publicMediaBaseUrl}:{withPublic:PublicSession;publicMediaBaseUrl?:string}):ChannelRepository{
  safeBase(publicMediaBaseUrl)
  return {
    async listChannels(input){
      const after=input.cursor?decodeChannelCursor(input.cursor,'channel_directory'):null
      if(after&&after.kind==='channel_directory'&&after.query!==(input.q??''))throw new Error('INVALID_CURSOR')
      return withPublic(async client=>{const result=await client.query<ChannelRow>('SELECT * FROM public.channel_public_list($1,$2,$3,$4,$5)',[input.q??'',after?.kind==='channel_directory'?after.rank:null,after?.kind==='channel_directory'?after.sortOrder:null,after?.kind==='channel_directory'?after.id:null,input.limit+1]);const rows=result.rows.slice(0,input.limit);const last=rows.at(-1);return ChannelPageSchema.parse({items:rows.map(row=>summary(row,publicMediaBaseUrl)),nextCursor:result.rows.length>input.limit&&last?encodeChannelCursor({v:1,kind:'channel_directory',query:input.q??'',rank:Number(last.search_rank??0),sortOrder:last.sort_order??0,id:last.id}):null})})
    },
    async getChannel(slug,recommendedLimit=8){
      return withPublic(async client=>{const result=await client.query<ChannelRow>('SELECT * FROM public.channel_public_get($1)',[slug]);const row=result.rows[0];if(!row)return null;if(recommendedLimit===0)return ChannelDetailSchema.parse({...summary(row,publicMediaBaseUrl),recommendedIps:[]});const ips=await client.query<IpRow>('SELECT * FROM public.channel_public_profiles($1,$2,$3,$4,$5,$6) ORDER BY curation_weight DESC, feed_weight DESC, latest_published_at DESC NULLS LAST, id DESC',[slug,null,null,null,null,recommendedLimit]);return ChannelDetailSchema.parse({...summary(row,publicMediaBaseUrl),recommendedIps:ips.rows.map(publicIp)})})
    },
    async listProfiles(slug,input){
      const after=input.cursor?decodeChannelCursor(input.cursor,'channel_ips'):null
      return withPublic(async client=>{const result=await client.query<IpRow>('SELECT * FROM public.channel_public_profiles($1,$2,$3,$4,$5,$6) ORDER BY curation_weight DESC, feed_weight DESC, latest_published_at DESC NULLS LAST, id DESC',[slug,after?.kind==='channel_ips'?after.curationWeight:null,after?.kind==='channel_ips'?after.feedWeight:null,after?.kind==='channel_ips'?after.latestPublishedAt:null,after?.kind==='channel_ips'?after.profileId:null,input.limit+1]);if(after?.kind==='channel_ips'&&result.rows[0]?.channel_id&&result.rows[0].channel_id!==after.channelId)throw new Error('INVALID_CURSOR');const rows=result.rows.slice(0,input.limit);const last=rows.at(-1);return ChannelIpPageSchema.parse({items:rows.map(publicIp),nextCursor:result.rows.length>input.limit&&last?encodeChannelCursor({v:1,kind:'channel_ips',channelId:last.channel_id!,curationWeight:last.curation_weight,feedWeight:last.feed_weight,latestPublishedAt:last.latest_published_at?iso(last.latest_published_at):null,profileId:last.id}):null})})
    },
    async listPosts(slug,input){
      const after=input.cursor?decodeChannelCursor(input.cursor,'channel_posts'):null
      return withPublic(async client=>{const result=await client.query<PostRow>(`SELECT * FROM public.channel_public_posts($1,$2,$3,$4) p ${publicMediaBaseUrl?'': 'WHERE NOT EXISTS (SELECT 1 FROM public.social_public_post_media(p.post_id))'} ORDER BY published_at DESC, post_id DESC`,[slug,after?.kind==='channel_posts'?after.publishedAt:null,after?.kind==='channel_posts'?after.id:null,input.limit+1]);const rows=result.rows.slice(0,input.limit);const last=rows.at(-1);return FeedPageSchema.parse({items:await Promise.all(rows.map(async row=>({id:row.post_id,body:row.body,languageCode:row.language_code,publishedAt:iso(row.published_at),author:publicIp(row),media:await publicMedia(client,row.post_id,publicMediaBaseUrl),likeCount:Number(row.like_count),commentCount:Number(row.comment_count),bookmarkCount:Number(row.bookmark_count),shareCount:Number(row.share_count)}))),nextCursor:result.rows.length>input.limit&&last?encodeChannelCursor({v:1,kind:'channel_posts',channelId:last.channel_id!,publishedAt:iso(last.published_at),id:last.post_id}):null})})
    },
  }
}

export function createPlatformChannelRepository({withPlatformActor:run=withPlatformActor,publicMediaBaseUrl}:{withPlatformActor?:WithPlatformActor;publicMediaBaseUrl?:string}={}):PlatformChannelRepository{
  safeBase(publicMediaBaseUrl)
  return {
    async listChannels(input){const after=input.query.cursor?decodeChannelCursor(input.query.cursor,'admin_channels'):null;if(after?.kind==='admin_channels'&&(after.query!==(input.query.q??'')||after.status!==(input.query.status??null)))throw new Error('INVALID_CURSOR');return run(input.actor,async client=>{const result=await client.query<ChannelRow>('SELECT * FROM public.platform_list_channels($1,$2,$3,$4,$5,$6)',[input.query.q??'',input.query.status??null,after?.kind==='admin_channels'?after.sortOrder:null,after?.kind==='admin_channels'?after.updatedAt:null,after?.kind==='admin_channels'?after.id:null,input.query.limit+1]);const rows=result.rows.slice(0,input.query.limit),last=rows.at(-1);return AdminChannelPageSchema.parse({items:rows.map(row=>record(row,publicMediaBaseUrl)),nextCursor:result.rows.length>input.query.limit&&last?encodeChannelCursor({v:1,kind:'admin_channels',query:input.query.q??'',status:input.query.status??null,sortOrder:last.sort_order!,updatedAt:iso(last.updated_at!),id:last.id}):null})})},
    async getChannel(input){return run(input.actor,async client=>{const result=await client.query<ChannelRow>('SELECT * FROM public.platform_channel_record($1)',[input.channelId]);return result.rows[0]?record(result.rows[0],publicMediaBaseUrl):null})},
    async createChannel(input){const value=CreateChannelSchema.parse(input.channel);return run(input.actor,async client=>{const created=await client.query<{id:string}>('SELECT id FROM public.platform_create_channel($1,$2,$3,$4,$5,$6)',[value.slug,value.name,value.description,value.imageObjectKey??null,value.sortOrder,input.requestId]);const id=created.rows[0]?.id;if(!id)throw new Error('CHANNEL_WRITE_FAILED');const result=await client.query<ChannelRow>('SELECT * FROM public.platform_channel_record($1)',[id]);if(!result.rows[0])throw new Error('CHANNEL_WRITE_FAILED');return record(result.rows[0],publicMediaBaseUrl)})},
    async updateChannel(input){const value=UpdateChannelSchema.parse(input.channel);return run(input.actor,async client=>{const hasImage=Object.hasOwn(value,'imageObjectKey');await client.query('SELECT public.platform_update_channel($1,$2,$3,$4,$5,$6,$7)',[input.channelId,value.name??null,value.description??null,value.imageObjectKey??null,hasImage,value.sortOrder??null,input.requestId]);const result=await client.query<ChannelRow>('SELECT * FROM public.platform_channel_record($1)',[input.channelId]);if(!result.rows[0])throw new Error('CHANNEL_NOT_FOUND');return record(result.rows[0],publicMediaBaseUrl)})},
    async setStatus(input){await run(input.actor,client=>client.query('SELECT public.platform_set_channel_status($1,$2,$3)',[input.channelId,input.status,input.requestId]).then(()=>undefined))},
    async replaceAliases(input){const value=ReplaceChannelAliasesSchema.parse(input.aliases);await run(input.actor,client=>client.query('SELECT public.platform_replace_channel_aliases($1,$2,$3)',[input.channelId,value.aliases,input.requestId]).then(()=>undefined))},
    async setMembership(input){const value=SetChannelMembershipSchema.parse(input.membership);await run(input.actor,client=>client.query('SELECT public.platform_set_channel_membership($1,$2,$3,$4,$5)',[input.channelId,value.ipProfileId,value.isPrimary,value.curationWeight,input.requestId]).then(()=>undefined))},
    async removeMembership(input){await run(input.actor,client=>client.query('SELECT public.platform_remove_channel_membership($1,$2,$3)',[input.channelId,input.ipProfileId,input.requestId]).then(()=>undefined))},
  }
}
