'use client'

import type {CreatorIp, FeedPage, FollowedIp} from '@aifans/contracts'
import {ProfileEmptyState} from './ProfileEmptyState'
import {QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import Link from 'next/link'
import {useContext, useRef, useState, type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import {PostCard} from '../social/PostCard'
import type {SocialLabels} from '../social/types'
import styles from './MyProfilePanel.module.css'
import {Avatar} from '../account/Avatar'
import {myProfileQueryOptions, type MyProfileTab as Tab, type PublicHuman, type ReadySection} from './my-profile-query'
import {QueryLoadError} from '../../lib/query-load-error'

export type MyProfileTabsLabels={tabs:string;myIps:string;liked:string;saved:string;following:string;loadingSection:string;authRequired:string;signIn:string;unavailableSection:string;retrySection:string;myIpsEmpty:string;likedEmpty:string;savedEmpty:string;followingEmpty:string}
type Section={status:'auth'}|{status:'unavailable'}|ReadySection
const tabs:Tab[]=['ips','liked','saved','following']

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
  const options=myProfileQueryOptions(scope,locale,active)
  const query=useQuery(options)
  const label:Record<Tab,string>={ips:labels.myIps,liked:labels.liked,saved:labels.saved,following:labels.following}
  const empty:Record<Tab,string>={ips:labels.myIpsEmpty,liked:labels.likedEmpty,saved:labels.savedEmpty,following:labels.followingEmpty}

  function select(tab:Tab){setActive(tab);setMoreUnavailable(false);refs.current[tab]?.focus()}
  function onKey(event:KeyboardEvent<HTMLButtonElement>,tab:Tab){const index=tabs.indexOf(tab);let next:number|null=null;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==null){event.preventDefault();select(tabs[next]!)}}
  async function loadMore(){
    const current=queryClient.getQueryData(options.queryKey)
    if(!current||current.status!=='ready'||!current.nextCursor||loadingMore)return
    setLoadingMore(true);setMoreUnavailable(false)
    try{
      const next=await queryClient.fetchQuery(myProfileQueryOptions(scope,locale,active,current.nextCursor))
      queryClient.setQueryData(options.queryKey,(previous)=>previous?.status==='ready'?{status:'ready' as const,items:[...previous.items,...next.items],nextCursor:next.nextCursor}:previous)
    }catch{setMoreUnavailable(true)}finally{setLoadingMore(false)}
  }
  const section:Section|undefined=query.data??(query.error?{status:query.error instanceof QueryLoadError&&query.error.status==='auth-required'?'auth':'unavailable'}:undefined)
  return <section className={styles.tabsSection}>
    <div aria-label={labels.tabs} className={styles.tabList} role="tablist">{tabs.map((tab)=><button aria-controls={`my-profile-${tab}`} aria-selected={active===tab} className={styles.tab} id={`my-profile-${tab}-tab`} key={tab} onClick={()=>select(tab)} onKeyDown={(event)=>onKey(event,tab)} ref={(node)=>{refs.current[tab]=node}} role="tab" tabIndex={active===tab?0:-1} type="button">{label[tab]}</button>)}</div>
    <div aria-labelledby={`my-profile-${active}-tab`} id={`my-profile-${active}`} role="tabpanel"><SectionContent empty={empty[active]} labels={labels} locale={locale} loadingMore={loadingMore} moreUnavailable={moreUnavailable} onLoadMore={()=>void loadMore()} onRetry={()=>void query.refetch()} section={section} socialLabels={socialLabels} tab={active} {...(viewerScope?{viewerScope}:{})}/></div>
  </section>
}

function SectionContent({empty,labels,locale,loadingMore,moreUnavailable,onLoadMore,onRetry,section,socialLabels,tab,viewerScope}:{empty:string;labels:MyProfileTabsLabels;locale:Locale;loadingMore:boolean;moreUnavailable:boolean;onLoadMore:()=>void;onRetry:()=>void;section:Section|undefined;socialLabels:SocialLabels;tab:Tab;viewerScope?:string}){
  if(!section)return <div className={styles.tabState} role="status">{labels.loadingSection}</div>
  if(section.status==='auth')return <div className={styles.tabState} role="alert"><p>{labels.authRequired}</p><Link href={authHref(locale,`/${locale}/profile`)}>{labels.signIn}</Link></div>
  if(section.status==='unavailable')return <div className={styles.tabState} role="alert"><p>{labels.unavailableSection}</p><button onClick={onRetry} type="button">{labels.retrySection}</button></div>
  if(!section.items.length&&!section.nextCursor)return <ProfileEmptyState kind={tab} locale={locale} own title={tab==='following'?(locale==='zh-CN'?'还没有关注':'Not following anyone yet'):empty}/>
  const more=section.nextCursor&&!moreUnavailable?<button className={styles.loadMore} disabled={loadingMore} onClick={onLoadMore} type="button">{loadingMore?labels.loadingSection:socialLabels.loadMore}</button>:null
  const retryMore=moreUnavailable?<div className={styles.tabState} role="alert"><p>{labels.unavailableSection}</p><button onClick={onLoadMore} type="button">{labels.retrySection}</button></div>:null
  if(tab==='ips'||tab==='following')return <div><div className={styles.ipList}>{(section.items as Array<CreatorIp|FollowedIp|PublicHuman>).map((ip)=>{
    const description='shortDescription' in ip?ip.shortDescription:'bio' in ip?ip.bio:null
    const human='kind' in ip&&ip.kind==='human'
    return <Link aria-label={ip.displayName} className={styles.ipRow} href={`/${locale}/${human?'humans':'profiles'}/${ip.id}`} key={ip.id}><Avatar avatarUrl={'avatarUrl' in ip?ip.avatarUrl:null} decorative displayName={ip.displayName} identityId={ip.id} kind={human?'human':'ip'} size="medium"/><span><strong>{ip.displayName}</strong><small>@{ip.username}</small>{description?<p>{description}</p>:null}</span></Link>
  })}</div>{more}{retryMore}</div>
  return <div>{(section.items as FeedPage['items']).map((post)=><PostCard canMutate key={post.id} labels={socialLabels} locale={locale} post={post} referenceTime={Date.now()} returnTo={`/${locale}/profile`} {...(viewerScope?{viewerScope}:{})}/>) }{more}{retryMore}</div>
}
