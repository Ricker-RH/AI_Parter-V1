import {FeedPageSchema, type FeedPage} from '@aifans/contracts'
import {queryOptions} from '@tanstack/react-query'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {QueryLoadError, rethrowQueryLoadError} from '../../lib/query-load-error'

type HomeFeedResult=Extract<SocialApiResult<FeedPage>,{status:'ok'}>

async function fetchHomeFeed(kind:'for_you'|'following',locale:Locale,cursor?:string,signal?:AbortSignal):Promise<HomeFeedResult>{
  const params=new URLSearchParams({kind,locale})
  if(cursor)params.set('cursor',cursor)
  try{
    const response=await fetch(`/api/feed?${params}`,{cache:'no-store',credentials:'same-origin',...(signal?{signal}:{})})
    if(!response.ok){await response.body?.cancel();throw new QueryLoadError(response.status===401?'auth-required':'unavailable')}
    const parsed=FeedPageSchema.safeParse(await response.json())
    if(!parsed.success)throw new QueryLoadError('unavailable')
    return {status:'ok',data:parsed.data}
  }catch(error){return rethrowQueryLoadError(error,signal)}
}

export function homeFeedQueryOptions(scope:string,locale:Locale,kind:'for_you'|'following',cursor?:string){
  return queryOptions({queryKey:['home-feed',scope,locale,kind,cursor??null] as const,queryFn:({signal})=>fetchHomeFeed(kind,locale,cursor,signal),staleTime:30_000,retry:false})
}

// Legacy callers consume result envelopes; shared queries cache only successful data.
export async function loadHomeFeed(kind:'for_you'|'following',locale:Locale,cursor?:string,signal?:AbortSignal):Promise<SocialApiResult<FeedPage>>{
  try{return await fetchHomeFeed(kind,locale,cursor,signal)}
  catch(error){if(error instanceof QueryLoadError)return {status:error.status};throw error}
}
