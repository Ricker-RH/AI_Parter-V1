'use client'
import {HumanProfileTabPageSchema,type HumanProfile,type HumanProfileTabKey,type HumanProfileTabPage,type FeedPost} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect,useRef,useState,type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialLabels} from '../social/types'
import {PostCard} from '../social/PostCard'
import {Avatar} from '../account/Avatar'
import {humanProfileLabels} from './human-profile-labels'
import styles from './MyProfilePanel.module.css'
type Props={profile:HumanProfile;locale:Locale;socialLabels:SocialLabels;viewerScope?:string}
type ReadyPage=Extract<HumanProfileTabPage,{state:'ready'}>
const tabs:HumanProfileTabKey[]=['ips','liked','saved','following']
export function HumanProfileTabs(props:Props){return <ScopedHumanProfileTabs key={`${props.profile.identity.id}:${props.viewerScope??'guest'}:${props.profile.visibility}:${JSON.stringify(props.profile.tabs)}`} {...props}/>}
function ScopedHumanProfileTabs({profile,locale,socialLabels,viewerScope}:Props){
 const [active,setActive]=useState<HumanProfileTabKey>('ips'),[page,setPage]=useState<ReadyPage|null>(null),[pending,setPending]=useState(true),[error,setError]=useState(false),[serverLocked,setServerLocked]=useState(false)
 const controller=useRef<AbortController|null>(null),refs=useRef<Partial<Record<HumanProfileTabKey,HTMLButtonElement|null>>>({}),busy=useRef(false),labels=humanProfileLabels(locale)
 const locked=serverLocked||(!profile.isOwner&&(profile.visibility==='private'||profile.tabs[active].state==='locked'))
 const names={ips:labels.ips,liked:labels.liked,saved:labels.saved,following:labels.followingTab}
 async function load(cursor?:string){
  controller.current?.abort();const request=new AbortController();controller.current=request;busy.current=true;setPending(true);setError(false)
  if(!cursor)setPage(null)
  try{
   const query=new URLSearchParams({limit:'20'});if(cursor)query.set('cursor',cursor)
   const response=await fetch(`/api/humans/${profile.identity.id}/tabs/${active}?${query}`,{credentials:'same-origin',cache:'no-store',signal:request.signal})
   if(!response.ok)throw Error()
   const parsed=HumanProfileTabPageSchema.parse(await response.json())
   if(request.signal.aborted)return
   if(parsed.state==='locked'){setPage(null);setServerLocked(true);return}
   if(parsed.tab!==active)throw Error()
   setPage(previous=>{
    if(!cursor||!previous||previous.tab!==parsed.tab)return parsed
    const items=[...previous.items,...parsed.items].filter((item,index,all)=>all.findIndex(candidate=>candidate.id===item.id)===index)
    return {...parsed,items} as ReadyPage
   })
  }catch{if(!request.signal.aborted)setError(true)}finally{if(!request.signal.aborted){busy.current=false;setPending(false)}}
 }
 useEffect(()=>{if(!locked)void load();return()=>{controller.current?.abort();busy.current=false}},[active,locked])
 function onKey(event:KeyboardEvent,tab:HumanProfileTabKey){const i=tabs.indexOf(tab),n=event.key==='Home'?0:event.key==='End'?3:event.key==='ArrowRight'?(i+1)%4:event.key==='ArrowLeft'?(i+3)%4:null;if(n!==null){event.preventDefault();setActive(tabs[n]!);refs.current[tabs[n]!]?.focus()}}
 return <section className={styles.tabsSection}><div aria-label={labels.tabs} className={styles.tabList} role="tablist">{tabs.map(tab=>{
  const hidden=serverLocked||(!profile.isOwner&&(profile.visibility==='private'||profile.tabs[tab].state==='locked'))
  return <button aria-controls={`human-panel-${tab}`} aria-describedby={hidden?'human-profile-private':undefined} aria-selected={active===tab} className={styles.tab} id={`human-tab-${tab}`} key={tab} onClick={()=>setActive(tab)} onKeyDown={event=>onKey(event,tab)} ref={node=>{refs.current[tab]=node}} role="tab" tabIndex={active===tab?0:-1} type="button">{hidden?<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{verticalAlign:'middle',marginInlineEnd:4}}><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8"/></svg>:null}{names[tab]}</button>
 })}</div>{tabs.map(tab=><div aria-labelledby={`human-tab-${tab}`} hidden={active!==tab} id={`human-panel-${tab}`} key={tab} role="tabpanel">{active===tab?locked?<div className={styles.tabState}><p id="human-profile-private">{labels.private}</p></div>:<>
  {page?.tab===tab?<>{page.items.length===0?<p className={styles.tabState}>{locale==='zh-CN'?'暂无内容。':'No content yet.'}</p>:page.tab==='liked'||page.tab==='saved'?page.items.map(post=><PostCard canMutate={Boolean(viewerScope)} key={post.id} labels={socialLabels} locale={locale} post={post as FeedPost} referenceTime={Date.now()} returnTo={`/${locale}/humans/${profile.identity.id}`} {...(viewerScope?{viewerScope}:{})}/>):<div className={styles.ipList}>{page.items.map(item=><Link className={styles.ipRow} href={`/${locale}/${item.kind==='human'?'humans':'profiles'}/${item.id}`} key={item.id}><Avatar avatarUrl={'avatarUrl' in item?item.avatarUrl??null:null} displayName={item.displayName} decorative size="medium"/><span><strong>{item.displayName}</strong><small>@{item.username}</small>{'bio' in item&&item.bio?<p>{item.bio}</p>:null}</span></Link>)}</div>}</>:null}
  {pending?<p className={styles.tabState} role="status">{labels.loading}</p>:null}
  {error?<div className={styles.tabState} role="alert"><p>{labels.error}</p><button onClick={()=>void load(page?.nextCursor??undefined)} type="button">{labels.retry}</button></div>:page?.nextCursor?<button className={styles.loadMore} disabled={pending} onClick={()=>{if(!busy.current)void load(page.nextCursor!)}} type="button">{socialLabels.loadMore}</button>:null}
 </>:null}</div>)}</section>
}
