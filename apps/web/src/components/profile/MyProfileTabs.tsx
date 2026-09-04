'use client'

import {CreatorIpPageSchema, FeedPageSchema, FollowedIpPageSchema, type CreatorIp, type FeedPage, type FollowedIp} from '@aifans/contracts'
import {EmptyState} from '@aifans/ui'
import {QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import Link from 'next/link'
import {useContext, useRef, useState, type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import {PostCard} from '../social/PostCard'
import type {SocialLabels} from '../social/types'
import styles from './MyProfilePanel.module.css'

export type MyProfileTabsLabels={tabs:string;myIps:string;liked:string;saved:string;following:string;loadingSection:string;authRequired:string;signIn:string;unavailableSection:string;retrySection:string;myIpsEmpty:string;likedEmpty:string;savedEmpty:string;followingEmpty:string}
type Tab='ips'|'liked'|'saved'|'following'
type Item=CreatorIp|FollowedIp|FeedPage['items'][number]
type ReadySection={status:'ready';items:Item[];nextCursor:string|null}
type Section={status:'auth'}|{status:'unavailable'}|ReadySection
const tabs:Tab[]=['ips','liked','saved','following']

function pageUrl(tab:Tab,cursor?:string):string {
  const base=tab==='ips'?'/api/creator/ips?limit=25':tab==='liked'?'/api/social/likes':tab==='saved'?'/api/social/bookmarks':'/api/social/following'
  return cursor?`${base}${base.includes('?')?'&':'?'}${new URLSearchParams({cursor})}`:base
}

async function loadSection(tab:Tab,cursor?:string):Promise<Section>{
  try {
    const response=await fetch(pageUrl(tab,cursor),{cache:'no-store',credentials:'same-origin'})
    if(response.status===401)return {status:'auth'}
    if(!response.ok)return {status:'unavailable'}
    const body:unknown=await response.json()
    const parsed=tab==='ips'?CreatorIpPageSchema.safeParse(body):tab==='following'?FollowedIpPageSchema.safeParse(body):FeedPageSchema.safeParse(body)
    return parsed.success?{status:'ready',items:parsed.data.items,nextCursor:parsed.data.nextCursor}:{status:'unavailable'}
  } catch { return {status:'unavailable'} }
}

function tabKey(scope:string,locale:Locale,tab:Tab,cursor?:string){return ['my-profile',scope,locale,tab,cursor??null] as const}

export function MyProfileTabs(props:{labels:MyProfileTabsLabels;locale:Locale;socialLabels:SocialLabels;viewerScope?:string}){
  const shared=useContext(AppQueryContext)
  const [client]=useState(createAppQueryClient)
  return shared?<ProfileTabs {...props}/>:<QueryClientProvider client={client}><ProfileTabs {...props}/></QueryClientProvider>
}

function ProfileTabs({labels,locale,socialLabels,viewerScope}: {labels:MyProfileTabsLabels;locale:Locale;socialLabels:SocialLabels;viewerScope?:string}){
  const [active,setActive]=useState<Tab>('ips')
  const [moreUnavailable,setMoreUnavailable]=useState(false)
  const [loadingMore,setLoadingMore]=useState(false)
  const refs=useRef<Record<Tab,HTMLButtonElement|null>>({ips:null,liked:null,saved:null,following:null})
  const queryClient=useQueryClient()
  // Profile collections are private: this account-specific scope prevents relationship data leaking across account changes.
  const scope=viewerScope??'anonymous'
  const query=useQuery({queryKey:tabKey(scope,locale,active),queryFn:()=>loadSection(active),staleTime:30_000})
  const label:Record<Tab,string>={ips:labels.myIps,liked:labels.liked,saved:labels.saved,following:labels.following}
  const empty:Record<Tab,string>={ips:labels.myIpsEmpty,liked:labels.likedEmpty,saved:labels.savedEmpty,following:labels.followingEmpty}

  function select(tab:Tab){setActive(tab);setMoreUnavailable(false);refs.current[tab]?.focus()}
  function onKey(event:KeyboardEvent<HTMLButtonElement>,tab:Tab){const index=tabs.indexOf(tab);let next:number|null=null;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==null){event.preventDefault();select(tabs[next]!)}}
  async function loadMore(){
    const current=queryClient.getQueryData<Section>(tabKey(scope,locale,active))
    if(!current||current.status!=='ready'||!current.nextCursor||loadingMore)return
    setLoadingMore(true);setMoreUnavailable(false)
    const next=await queryClient.fetchQuery({queryKey:tabKey(scope,locale,active,current.nextCursor),queryFn:()=>loadSection(active,current.nextCursor!),staleTime:0})
    if(next.status==='ready')queryClient.setQueryData<Section>(tabKey(scope,locale,active),(previous)=>previous?.status==='ready'?{status:'ready',items:[...previous.items,...next.items],nextCursor:next.nextCursor}:previous)
    else setMoreUnavailable(true)
    setLoadingMore(false)
  }
  const section=query.data
  return <section className={styles.tabsSection}>
    <div aria-label={labels.tabs} className={styles.tabList} role="tablist">{tabs.map((tab)=><button aria-controls={`my-profile-${tab}`} aria-selected={active===tab} className={styles.tab} id={`my-profile-${tab}-tab`} key={tab} onClick={()=>select(tab)} onKeyDown={(event)=>onKey(event,tab)} ref={(node)=>{refs.current[tab]=node}} role="tab" tabIndex={active===tab?0:-1} type="button">{label[tab]}</button>)}</div>
    <div aria-labelledby={`my-profile-${active}-tab`} id={`my-profile-${active}`} role="tabpanel"><SectionContent empty={empty[active]} labels={labels} locale={locale} loadingMore={loadingMore} moreUnavailable={moreUnavailable} onLoadMore={()=>void loadMore()} onRetry={()=>void query.refetch()} section={section} socialLabels={socialLabels} tab={active} {...(viewerScope?{viewerScope}:{})}/></div>
  </section>
}

function SectionContent({empty,labels,locale,loadingMore,moreUnavailable,onLoadMore,onRetry,section,socialLabels,tab,viewerScope}:{empty:string;labels:MyProfileTabsLabels;locale:Locale;loadingMore:boolean;moreUnavailable:boolean;onLoadMore:()=>void;onRetry:()=>void;section:Section|undefined;socialLabels:SocialLabels;tab:Tab;viewerScope?:string}){
  if(!section)return <div className={styles.tabState} role="status">{labels.loadingSection}</div>
  if(section.status==='auth')return <div className={styles.tabState} role="alert"><p>{labels.authRequired}</p><Link href={authHref(locale,`/${locale}/profile`)}>{labels.signIn}</Link></div>
  if(section.status==='unavailable')return <div className={styles.tabState} role="alert"><p>{labels.unavailableSection}</p><button onClick={onRetry} type="button">{labels.retrySection}</button></div>
  if(!section.items.length&&!section.nextCursor)return <div className={styles.tabEmpty}><EmptyState description="" title={empty}/></div>
  const more=section.nextCursor&&!moreUnavailable?<button className={styles.loadMore} disabled={loadingMore} onClick={onLoadMore} type="button">{loadingMore?labels.loadingSection:socialLabels.loadMore}</button>:null
  const retryMore=moreUnavailable?<div className={styles.tabState} role="alert"><p>{labels.unavailableSection}</p><button onClick={onLoadMore} type="button">{labels.retrySection}</button></div>:null
  if(tab==='ips'||tab==='following')return <div><div className={styles.ipList}>{(section.items as Array<CreatorIp|FollowedIp>).map((ip)=>{
    const description='shortDescription' in ip?ip.shortDescription:ip.bio
    return <Link aria-label={ip.displayName} className={styles.ipRow} href={`/${locale}/profiles/${ip.id}`} key={ip.id}><span className={styles.ipAvatar} aria-hidden="true">{ip.displayName.slice(0,1)}</span><span><strong>{ip.displayName}</strong><small>@{ip.username}</small>{description?<p>{description}</p>:null}</span></Link>
  })}</div>{more}{retryMore}</div>
  return <div>{(section.items as FeedPage['items']).map((post)=><PostCard canMutate key={post.id} labels={socialLabels} locale={locale} post={post} referenceTime={Date.now()} returnTo={`/${locale}/profile`} {...(viewerScope?{viewerScope}:{})}/>) }{more}{retryMore}</div>
}
