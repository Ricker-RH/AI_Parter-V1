'use client'

import type {FeedPage} from '@aifans/contracts'
import {QueryClientProvider, useQuery} from '@tanstack/react-query'
import {useContext, useEffect, useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import {FeedContent} from './FeedContent'
import type {SocialLabels} from './types'
import {homeFeedQueryOptions} from './home-feed-query'
import {QueryLoadError} from '../../lib/query-load-error'

export {loadHomeFeed} from './home-feed-query'

type Props={canMutate:boolean;cursor?:string;emptyActionHref?:string;empty?:'home'|'bookmarks'|'liked';initialResult?:SocialApiResult<FeedPage>;kind:'for_you'|'following';labels:SocialLabels;loading?:boolean;locale:Locale;onRefreshReady?: (refresh: () => Promise<void>) => void;returnTo:string;viewerScope?:string}

function CachedFeed(props:Props){
  // Personalized projections are scoped to the opaque server-derived viewer
  // scope; anonymous users only ever share the public key.
  const scope=props.viewerScope??'public'
  const query=useQuery({...homeFeedQueryOptions(scope,props.locale,props.kind,props.cursor),...(props.initialResult?.status==='ok'?{initialData:props.initialResult}:{})})
  useEffect(() => { props.onRefreshReady?.(async () => { await query.refetch({cancelRefetch: true}) }) }, [props.onRefreshReady, query.refetch])
  const result=query.data??(query.error?{status:query.error instanceof QueryLoadError?query.error.status:'unavailable' as const}:props.initialResult)
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
