'use client'

import {CreatorIpPageSchema, FeedPageSchema, FollowedIpPageSchema, type CreatorIp, type FeedPage, type FollowedIp} from '@aifans/contracts'
import {EmptyState} from '@aifans/ui'
import Link from 'next/link'
import {useEffect, useRef, useState, type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {PostCard} from '../social/PostCard'
import type {SocialLabels} from '../social/types'
import styles from './MyProfilePanel.module.css'

export type MyProfileTabsLabels={tabs:string;myIps:string;liked:string;saved:string;following:string;loadingSection:string;authRequired:string;signIn:string;unavailableSection:string;retrySection:string;myIpsEmpty:string;likedEmpty:string;savedEmpty:string;followingEmpty:string}
type Tab='ips'|'liked'|'saved'|'following'
type Item=CreatorIp|FollowedIp|FeedPage['items'][number]
type Section=
  |{status:'idle'}
  |{status:'loading'}
  |{status:'auth'}
  |{status:'unavailable'}
  |{status:'ready';items:Item[];nextCursor:string|null;loadingMore:boolean;moreUnavailable:boolean}
const tabs:Tab[]=['ips','liked','saved','following']

function pageUrl(tab:Tab,cursor?:string):string {
  const base=tab==='ips'?'/api/creator/ips?limit=25':tab==='liked'?'/api/social/likes':tab==='saved'?'/api/social/bookmarks':'/api/social/following'
  return cursor?`${base}${base.includes('?')?'&':'?'}${new URLSearchParams({cursor})}`:base
}

export function MyProfileTabs({labels,locale,socialLabels,viewerScope}:{labels:MyProfileTabsLabels;locale:Locale;socialLabels:SocialLabels;viewerScope?:string}){
  const [active,setActive]=useState<Tab>('ips')
  const [sections,setSections]=useState<Record<Tab,Section>>({ips:{status:'idle'},liked:{status:'idle'},saved:{status:'idle'},following:{status:'idle'}})
  const refs=useRef<Record<Tab,HTMLButtonElement|null>>({ips:null,liked:null,saved:null,following:null})
  const label:Record<Tab,string>={ips:labels.myIps,liked:labels.liked,saved:labels.saved,following:labels.following}
  const empty:Record<Tab,string>={ips:labels.myIpsEmpty,liked:labels.likedEmpty,saved:labels.savedEmpty,following:labels.followingEmpty}

  async function load(tab:Tab,cursor?:string,append=false){
    setSections((value)=>{
      const current=value[tab]
      return {...value,[tab]:append&&current.status==='ready'?{...current,loadingMore:true,moreUnavailable:false}:{status:'loading'}}
    })
    try{
      const response=await fetch(pageUrl(tab,cursor),{cache:'no-store',credentials:'same-origin'})
      if(response.status===401){setSections((value)=>({...value,[tab]:{status:'auth'}}));return}
      if(!response.ok)throw new Error('UNAVAILABLE')
      const body:unknown=await response.json()
      const parsed=tab==='ips'?CreatorIpPageSchema.safeParse(body):tab==='following'?FollowedIpPageSchema.safeParse(body):FeedPageSchema.safeParse(body)
      if(!parsed.success)throw new Error('INVALID')
      setSections((value)=>{
        const current=value[tab]
        const items:Item[]=append&&current.status==='ready'?[...current.items,...parsed.data.items]:parsed.data.items
        return {...value,[tab]:{status:'ready',items,nextCursor:parsed.data.nextCursor,loadingMore:false,moreUnavailable:false}}
      })
    }catch{
      setSections((value)=>{
        const current=value[tab]
        return {...value,[tab]:append&&current.status==='ready'?{...current,loadingMore:false,moreUnavailable:true}:{status:'unavailable'}}
      })
    }
  }
  useEffect(()=>{if(sections[active].status==='idle')void load(active)},[active,sections])
  function select(tab:Tab){setActive(tab);refs.current[tab]?.focus()}
  function onKey(event:KeyboardEvent<HTMLButtonElement>,tab:Tab){const index=tabs.indexOf(tab);let next:number|null=null;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==null){event.preventDefault();select(tabs[next]!)}}
  const section=sections[active]
  return <section className={styles.tabsSection}>
    <div aria-label={labels.tabs} className={styles.tabList} role="tablist">{tabs.map((tab)=><button aria-controls={`my-profile-${tab}`} aria-selected={active===tab} className={styles.tab} id={`my-profile-${tab}-tab`} key={tab} onClick={()=>setActive(tab)} onKeyDown={(event)=>onKey(event,tab)} ref={(node)=>{refs.current[tab]=node}} role="tab" tabIndex={active===tab?0:-1} type="button">{label[tab]}</button>)}</div>
    {tabs.map((tab)=><div aria-labelledby={`my-profile-${tab}-tab`} hidden={active!==tab} id={`my-profile-${tab}`} key={tab} role="tabpanel">{active===tab?<SectionContent empty={empty[tab]} labels={labels} locale={locale} load={(cursor,append)=>void load(tab,cursor,append)} section={section} socialLabels={socialLabels} tab={tab} {...(viewerScope ? {viewerScope} : {})}/>:null}</div>)}
  </section>
}

function SectionContent({empty,labels,locale,load,section,socialLabels,tab,viewerScope}:{empty:string;labels:MyProfileTabsLabels;locale:Locale;load:(cursor?:string,append?:boolean)=>void;section:Section;socialLabels:SocialLabels;tab:Tab;viewerScope?:string}){
  if(section.status==='idle'||section.status==='loading')return <div className={styles.tabState} role="status">{labels.loadingSection}</div>
  if(section.status==='auth')return <div className={styles.tabState} role="alert"><p>{labels.authRequired}</p><Link href={authHref(locale,`/${locale}/profile`)}>{labels.signIn}</Link></div>
  if(section.status==='unavailable')return <div className={styles.tabState} role="alert"><p>{labels.unavailableSection}</p><button onClick={()=>load()} type="button">{labels.retrySection}</button></div>
  if(!section.items.length&&!section.nextCursor)return <div className={styles.tabEmpty}><EmptyState description="" title={empty}/></div>
  const more=section.nextCursor&&!section.moreUnavailable?<button className={styles.loadMore} disabled={section.loadingMore} onClick={()=>load(section.nextCursor!,true)} type="button">{section.loadingMore?labels.loadingSection:socialLabels.loadMore}</button>:null
  const retryMore=section.moreUnavailable?<div className={styles.tabState} role="alert"><p>{labels.unavailableSection}</p><button onClick={()=>load(section.nextCursor!,true)} type="button">{labels.retrySection}</button></div>:null
  if(tab==='ips'||tab==='following')return <div><div className={styles.ipList}>{(section.items as Array<CreatorIp|FollowedIp>).map((ip)=>{
    const description='shortDescription' in ip?ip.shortDescription:ip.bio
    return <Link aria-label={ip.displayName} className={styles.ipRow} href={`/${locale}/profiles/${ip.id}`} key={ip.id}><span className={styles.ipAvatar} aria-hidden="true">{ip.displayName.slice(0,1)}</span><span><strong>{ip.displayName}</strong><small>@{ip.username}</small>{description?<p>{description}</p>:null}</span></Link>
  })}</div>{more}{retryMore}</div>
  return <div>{(section.items as FeedPage['items']).map((post)=><PostCard canMutate key={post.id} labels={socialLabels} locale={locale} post={post} referenceTime={Date.now()} returnTo={`/${locale}/profile`} {...(viewerScope ? {viewerScope} : {})}/>) }{more}{retryMore}</div>
}
