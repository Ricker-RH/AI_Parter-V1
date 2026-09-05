import {CreatorIpPageSchema, FeedPageSchema, FollowedIpPageSchema, HumanProfileTabPageSchema, type HumanProfileTabPage, type CreatorIp, type FeedPage, type FollowedIp} from '@aifans/contracts'
import {queryOptions} from '@tanstack/react-query'
import type {Locale} from '../../i18n/config'
import {QueryLoadError, rethrowQueryLoadError} from '../../lib/query-load-error'

export type PublicHuman=Extract<HumanProfileTabPage,{state:'ready';tab:'following'}>['items'][number]
export type MyProfileTab='ips'|'liked'|'saved'|'following'
type Item=CreatorIp|FollowedIp|PublicHuman|FeedPage['items'][number]
export type ReadySection={status:'ready';items:Item[];nextCursor:string|null}

function pageUrl(tab:MyProfileTab,cursor?:string):string{
  const base=tab==='ips'?'/api/creator/ips?limit=25':tab==='liked'?'/api/social/likes':tab==='saved'?'/api/social/bookmarks':'/api/social/following'
  return cursor?`${base}${base.includes('?')?'&':'?'}${new URLSearchParams({cursor})}`:base
}

async function loadSection(tab:MyProfileTab,cursor?:string,profileId?:string,signal?:AbortSignal):Promise<ReadySection>{
  try{
    const response=await fetch(tab==='following'&&profileId?`/api/humans/${profileId}/tabs/following?${new URLSearchParams({limit:'25',...(cursor?{cursor}:{})})}`:pageUrl(tab,cursor),{cache:'no-store',credentials:'same-origin',...(signal?{signal}:{})})
    if(!response.ok){await response.body?.cancel();throw new QueryLoadError(response.status===401?'auth-required':'unavailable')}
    const body:unknown=await response.json()
    if(tab==='following'&&profileId){
      const parsed=HumanProfileTabPageSchema.safeParse(body)
      if(!parsed.success||parsed.data.state!=='ready'||parsed.data.tab!=='following')throw new QueryLoadError('unavailable')
      return {status:'ready',items:parsed.data.items,nextCursor:parsed.data.nextCursor}
    }
    const parsed=tab==='ips'?CreatorIpPageSchema.safeParse(body):tab==='following'?FollowedIpPageSchema.safeParse(body):FeedPageSchema.safeParse(body)
    if(!parsed.success)throw new QueryLoadError('unavailable')
    return {status:'ready',items:parsed.data.items,nextCursor:parsed.data.nextCursor}
  }catch(error){return rethrowQueryLoadError(error,signal)}
}

export function myProfileQueryOptions(scope:string,locale:Locale,tab:MyProfileTab,cursor?:string){
  const profileId=scope.startsWith('human:')?scope.slice(6):undefined
  return queryOptions({queryKey:['my-profile',scope,locale,tab,cursor??null,...(tab==='following'?['people-and-ips']:[])] as const,queryFn:({signal})=>loadSection(tab,cursor,profileId,signal),staleTime:30_000,retry:false})
}
