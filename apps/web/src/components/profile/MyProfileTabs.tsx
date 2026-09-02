'use client'

import {CreatorIpPageSchema, FeedPageSchema, type CreatorIp, type FeedPage} from '@aifans/contracts'
import {EmptyState} from '@aifans/ui'
import Link from 'next/link'
import {useEffect, useRef, useState, type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {PostCard} from '../social/PostCard'
import type {SocialLabels} from '../social/types'
import styles from './MyProfilePanel.module.css'

export type MyProfileTabsLabels={tabs:string;myIps:string;liked:string;saved:string;following:string;loadingSection:string;unavailableSection:string;retrySection:string;myIpsEmpty:string;likedEmpty:string;savedEmpty:string;followingEmpty:string}
type Tab='ips'|'liked'|'saved'|'following'
type Section={status:'idle'}|{status:'loading'}|{status:'unavailable'}|{status:'ready';items:CreatorIp[]|FeedPage['items']}
const tabs:Tab[]=['ips','liked','saved','following']

export function MyProfileTabs({labels,locale,socialLabels}:{labels:MyProfileTabsLabels;locale:Locale;socialLabels:SocialLabels}){
  const [active,setActive]=useState<Tab>('ips')
  const [sections,setSections]=useState<Record<Tab,Section>>({ips:{status:'idle'},liked:{status:'idle'},saved:{status:'idle'},following:{status:'idle'}})
  const refs=useRef<Record<Tab,HTMLButtonElement|null>>({ips:null,liked:null,saved:null,following:null})
  const label:Record<Tab,string>={ips:labels.myIps,liked:labels.liked,saved:labels.saved,following:labels.following}
  const empty:Record<Tab,string>={ips:labels.myIpsEmpty,liked:labels.likedEmpty,saved:labels.savedEmpty,following:labels.followingEmpty}

  async function load(tab:Tab){
    if(tab==='following'){
      setSections((value)=>({...value,following:{status:'unavailable'}}))
      return
    }
    setSections((value)=>({...value,[tab]:{status:'loading'}}))
    const url=tab==='ips'?'/api/creator/ips?limit=25':tab==='liked'?'/api/social/likes':'/api/social/bookmarks'
    try{const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error('UNAVAILABLE');const body:unknown=await response.json();const parsed=tab==='ips'?CreatorIpPageSchema.safeParse(body):FeedPageSchema.safeParse(body);if(!parsed.success)throw new Error('INVALID');setSections((value)=>({...value,[tab]:{status:'ready',items:parsed.data.items}}))}catch{setSections((value)=>({...value,[tab]:{status:'unavailable'}}))}
  }
  useEffect(()=>{if(sections[active].status==='idle')void load(active)},[active,sections])
  function select(tab:Tab){setActive(tab);refs.current[tab]?.focus()}
  function onKey(event:KeyboardEvent<HTMLButtonElement>,tab:Tab){const index=tabs.indexOf(tab);let next:number|null=null;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==null){event.preventDefault();select(tabs[next]!)}}
  const section=sections[active]
  return <section className={styles.tabsSection}>
    <div aria-label={labels.tabs} className={styles.tabList} role="tablist">{tabs.map((tab)=><button aria-controls={`my-profile-${tab}`} aria-selected={active===tab} className={styles.tab} id={`my-profile-${tab}-tab`} key={tab} onClick={()=>setActive(tab)} onKeyDown={(event)=>onKey(event,tab)} ref={(node)=>{refs.current[tab]=node}} role="tab" tabIndex={active===tab?0:-1} type="button">{label[tab]}</button>)}</div>
    {tabs.map((tab)=><div aria-labelledby={`my-profile-${tab}-tab`} hidden={active!==tab} id={`my-profile-${tab}`} key={tab} role="tabpanel">{active===tab?<SectionContent empty={empty[tab]} labels={labels} locale={locale} {...(tab==='following'?{}:{retry:()=>void load(tab)})} section={section} socialLabels={socialLabels} tab={tab}/>:null}</div>)}
  </section>
}

function SectionContent({empty,labels,locale,retry,section,socialLabels,tab}:{empty:string;labels:MyProfileTabsLabels;locale:Locale;retry?:()=>void;section:Section;socialLabels:SocialLabels;tab:Tab}){
  if(section.status==='idle'||section.status==='loading')return <div className={styles.tabState} role="status">{labels.loadingSection}</div>
  if(section.status==='unavailable')return <div className={styles.tabState} role="alert"><p>{labels.unavailableSection}</p>{retry?<button onClick={retry} type="button">{labels.retrySection}</button>:null}</div>
  if(!section.items.length)return <div className={styles.tabEmpty}><EmptyState description="" title={empty}/></div>
  if(tab==='ips')return <div className={styles.ipList}>{(section.items as CreatorIp[]).map((ip)=><Link aria-label={ip.displayName} className={styles.ipRow} href={`/${locale}/profiles/${ip.id}`} key={ip.id}><span className={styles.ipAvatar} aria-hidden="true">{ip.displayName.slice(0,1)}</span><span><strong>{ip.displayName}</strong><small>@{ip.username}</small>{ip.shortDescription?<p>{ip.shortDescription}</p>:null}</span></Link>)}</div>
  return <div>{(section.items as FeedPage['items']).map((post)=><PostCard canMutate key={post.id} labels={socialLabels} locale={locale} post={post} referenceTime={Date.now()} returnTo={`/${locale}/profile`}/>)}</div>
}
