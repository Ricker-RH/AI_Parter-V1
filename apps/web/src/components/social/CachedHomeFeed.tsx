'use client'

import {FeedPageSchema, type FeedPage} from '@aifans/contracts'
import {QueryClientProvider, useQuery} from '@tanstack/react-query'
import {useContext, useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import {FeedContent} from './FeedContent'
import type {SocialLabels} from './types'

type Props={canMutate:boolean;cursor?:string;emptyActionHref?:string;empty?:'home'|'bookmarks'|'liked';initialResult?:SocialApiResult<FeedPage>;kind:'for_you'|'following';labels:SocialLabels;loading?:boolean;locale:Locale;returnTo:string;viewerScope?:string}

export async function loadHomeFeed(kind:'for_you'|'following',locale:Locale,cursor?:string,signal?:AbortSignal):Promise<SocialApiResult<FeedPage>>{
  const params=new URLSearchParams({kind,locale})
  if(cursor)params.set('cursor',cursor)
  try{
    const response=await fetch(`/api/feed?${params}`,{cache:'no-store',credentials:'same-origin',...(signal?{signal}:{})})
    if(response.status===401)return {status:'auth-required'}
    const body:unknown=await response.json()
    const parsed=FeedPageSchema.safeParse(body)
    return response.ok&&parsed.success?{status:'ok',data:parsed.data}:{status:'unavailable'}
  }catch{return {status:'unavailable'}}
}

function CachedFeed(props:Props){
  // Personalized projections are scoped to the opaque server-derived viewer
  // scope; anonymous users only ever share the public key.
  const scope=props.viewerScope??'public'
  const query=useQuery({queryKey:['home-feed',scope,props.locale,props.kind,props.cursor??null],queryFn:({signal})=>loadHomeFeed(props.kind,props.locale,props.cursor,signal),...(props.initialResult?{initialData:props.initialResult}:{}),staleTime:30_000})
  const result=query.data??props.initialResult
  if(!result&&(query.isPending||props.loading))return <div aria-busy="true" className="route-skeleton route-skeleton--feed" data-home-feed-fallback role="status"/>
  const resolved=result??{status:'unavailable' as const}
  const nextCursor=resolved.status==='ok'?resolved.data.nextCursor:null
  const pageQuery=new URLSearchParams()
  if(props.kind==='following')pageQuery.set('feed','following')
  if(nextCursor)pageQuery.set('cursor',nextCursor)
  const moreHref=nextCursor?`/${props.locale}?${pageQuery}`:undefined
  return <FeedContent canMutate={props.canMutate} {...(props.empty?{empty:props.empty}:{})} {...(props.emptyActionHref?{emptyActionHref:props.emptyActionHref}:{})} labels={props.labels} locale={props.locale} {...(moreHref?{moreHref}:{})} result={resolved} returnTo={props.returnTo} {...(props.viewerScope?{viewerScope:props.viewerScope}:{})}/>
}

export function CachedHomeFeed(props:Props){
  const shared=useContext(AppQueryContext)
  const [client]=useState(createAppQueryClient)
  return shared?<CachedFeed {...props}/>:<QueryClientProvider client={client}><CachedFeed {...props}/></QueryClientProvider>
}
