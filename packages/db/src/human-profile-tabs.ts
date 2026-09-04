import {HumanProfileTabKeySchema,HumanProfileTabPageSchema,PublicIpSchema,PublicHumanSchema,FeedPostSchema,type HumanProfileTabKey,type HumanProfileTabPage} from '@aifans/contracts'
import {z} from 'zod'
import type {Actor,QueryClient,WithActor} from './session.js'
type WithPublic=<T>(callback:(client:QueryClient)=>Promise<T>)=>Promise<T>
const cursorSchema=z.strictObject({v:z.literal(1),profileId:z.uuid(),tab:HumanProfileTabKeySchema,at:z.iso.datetime(),id:z.uuid()})
export function createHumanProfileTabsRepository({withActor,withPublic,publicMediaBaseUrl}:{withActor:WithActor;withPublic:WithPublic;publicMediaBaseUrl?:string}){
 let base:URL|undefined
 if(publicMediaBaseUrl){base=new URL(publicMediaBaseUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('INVALID_PUBLIC_MEDIA_BASE_URL');if(!base.pathname.endsWith('/'))base.pathname+='/' }
 function media(key:unknown,pattern:RegExp){if(typeof key!=='string'||!pattern.test(key))throw new Error('INVALID_PUBLIC_MEDIA_KEY');if(!base)throw new Error('PUBLIC_MEDIA_BASE_URL_REQUIRED');return new URL(key,base).toString()}
 function ip(r:Record<string,unknown>){return PublicIpSchema.parse({kind:'ip',id:r.id,username:r.username,displayName:r.display_name,bio:r.bio,languages:r.languages,visualType:r.visual_type??'hybrid',...(r.creator_id?{creator:{id:r.creator_id,username:r.creator_username,displayName:r.creator_display_name}}:{})})}
 function item(r:Record<string,unknown>){
  if(r.kind==='ip')return ip(r)
  if(r.kind==='human')return PublicHumanSchema.parse({kind:'human',id:r.id,username:r.username,displayName:r.display_name,avatarUrl:r.avatar_object_key?media(r.avatar_object_key,new RegExp(`^public/profiles/${r.id}/avatar/[0-9a-f-]+\\.webp$`)):null})
  return FeedPostSchema.parse({id:r.post_id,body:r.body,languageCode:r.language_code,publishedAt:new Date(String(r.published_at)).toISOString(),author:ip(r),
   media:z.array(z.record(z.string(),z.unknown())).parse(r.media).map(m=>({id:m.id,type:'image',url:media(m.object_key,/^public\/posts\/[0-9a-f-]+\.(?:jpg|png|webp)$/),altText:m.alt_text,width:m.width,height:m.height,aspectRatio:typeof m.width==='number'&&typeof m.height==='number'?m.width/m.height:null})),
   likeCount:Number(r.like_count),commentCount:Number(r.comment_count),bookmarkCount:Number(r.bookmark_count),shareCount:Number(r.share_count),viewerHasLiked:r.viewer_has_liked,viewerHasBookmarked:r.viewer_has_bookmarked,viewerFollowsAuthor:r.viewer_follows_author})
 }
 return{async getTab(input:{viewer:Actor|null;profileId:string;tab:HumanProfileTabKey;limit:number;cursor?:string}):Promise<HumanProfileTabPage|null>{
  const profileId=z.uuid().parse(input.profileId),tab=HumanProfileTabKeySchema.parse(input.tab),limit=z.number().int().min(1).max(50).parse(input.limit)
  let after:z.infer<typeof cursorSchema>|null=null
  if(input.cursor){try{if(input.cursor.length>1024||!/^[A-Za-z0-9_-]+$/.test(input.cursor))throw new Error();after=cursorSchema.parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString()));if(after.profileId!==profileId||after.tab!==tab)throw new Error()}catch{throw Object.assign(new Error('INVALID_CURSOR'),{code:'22023'})}}
  const read=async(client:QueryClient)=>{
   const result=await client.query<{state:'locked'|'ready';item:Record<string,unknown>|null;sort_at:string|null;item_id:string|null}>('SELECT * FROM public.human_public_tab($1,$2,$3,$4,$5)',[profileId,tab,after?.at??null,after?.id??null,limit+1])
   if(!result.rows.length)return null
   if(result.rows[0]?.state==='locked')return HumanProfileTabPageSchema.parse({state:'locked'})
   const rows=result.rows.filter(r=>r.item!==null),page=rows.slice(0,limit),last=page.at(-1)
   return HumanProfileTabPageSchema.parse({state:'ready',tab,items:page.map(r=>item(r.item!)),nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify(cursorSchema.parse({v:1,profileId,tab,at:last.sort_at,id:last.item_id}))).toString('base64url'):null})
  }
  return input.viewer?withActor(input.viewer,read):withPublic(read)
 }}
}
export type HumanProfileTabsRepository=ReturnType<typeof createHumanProfileTabsRepository>
