'use client'
import type {HumanProfile} from '@aifans/contracts'
import Link from 'next/link'
import {useRef,useState,type CSSProperties,type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {Avatar} from '../account/Avatar'
import {ProfilePageHeader} from './ProfilePageHeader'
import {PROFILE_BACKGROUND_COLORS} from './ProfileEditor'
import {HumanProfileActions} from './HumanProfileActions'
import {humanProfileLabels} from './human-profile-labels'
import styles from './MyProfilePanel.module.css'

export function HumanProfilePanel({initialProfile,locale}:{initialProfile:HumanProfile;locale:Locale}){
 const [profile,setProfile]=useState(initialProfile),labels=humanProfileLabels(locale)
 const background=profile.background
 const backgroundStyle=background.type==='image'?{'--profile-background-image':`url("${background.url}")`,'--profile-background-focal-x':`${background.focalX*100}%`,'--profile-background-focal-y':`${background.focalY*100}%`} as CSSProperties:{'--profile-background-color':PROFILE_BACKGROUND_COLORS[background.colorKey]} as CSSProperties
 return <div className={styles.page}><div className={styles.pageContent}>
  <ProfilePageHeader backHref={`/${locale}`} labels={{}} locale={locale} username={profile.identity.username}/>
  <div className={styles.surface}><div className={styles.profileBody}>
   <section aria-labelledby="human-profile-title" className={styles.profile} data-background-type={background.type} style={background.type==='color'?{'--profile-foreground':background.colorKey==='graphite'?PROFILE_BACKGROUND_COLORS.paper:PROFILE_BACKGROUND_COLORS.graphite} as CSSProperties:undefined}>
    <div aria-hidden="true" className={styles.profileBackground} style={backgroundStyle}/>
    <header className={styles.identityRow}><div className={styles.identityCopy}><h2 id="human-profile-title">{profile.identity.displayName}</h2><p>@{profile.identity.username}</p></div><Avatar avatarUrl={profile.identity.avatarUrl} className={styles.avatar!} displayName={profile.identity.displayName} size="large"/></header>
    {profile.bio?<div className={styles.details}><p className={styles.bio}>{profile.bio}</p></div>:null}
    {profile.isOwner?<Link className={styles.editAction} href={`/${locale}/profile`}>{labels.edit}</Link>:<HumanProfileActions key={profile.identity.id} locale={locale} onProfileChange={setProfile} profile={profile}/>}
   </section>
   <HumanProfileTabs profile={profile} locale={locale}/>
  </div></div>
 </div></div>
}

function HumanProfileTabs({profile,locale}:{profile:HumanProfile;locale:Locale}){
 const tabs=['ips','liked','saved','following'] as const
 type Tab=typeof tabs[number]
 const [active,setActive]=useState<Tab>('ips'),refs=useRef<Partial<Record<Tab,HTMLButtonElement|null>>>({}),labels=humanProfileLabels(locale)
 const names={ips:labels.ips,liked:labels.liked,saved:labels.saved,following:labels.followingTab}
 const locked=!profile.isOwner&&(profile.visibility==='private'||profile.tabs[active].state==='locked')
 function onKey(event:KeyboardEvent,tab:Tab){const i=tabs.indexOf(tab);const n=event.key==='Home'?0:event.key==='End'?3:event.key==='ArrowRight'?(i+1)%4:event.key==='ArrowLeft'?(i+3)%4:null;if(n!==null){event.preventDefault();setActive(tabs[n]!);refs.current[tabs[n]!]?.focus()}}
 return <section className={styles.tabsSection}><div aria-label={labels.tabs} className={styles.tabList} role="tablist">{tabs.map(tab=><button aria-controls={`human-panel-${tab}`} aria-describedby={!profile.isOwner&&(profile.visibility==='private'||profile.tabs[tab].state==='locked')?'human-profile-private':undefined} aria-selected={active===tab} className={styles.tab} id={`human-tab-${tab}`} key={tab} onClick={()=>setActive(tab)} onKeyDown={e=>onKey(e,tab)} ref={node=>{refs.current[tab]=node}} role="tab" tabIndex={active===tab?0:-1} type="button">{!profile.isOwner&&(profile.visibility==='private'||profile.tabs[tab].state==='locked')?<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{verticalAlign:'middle',marginInlineEnd:4}}><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8"/></svg>:null}{names[tab]}</button>)}</div>
  {tabs.map(tab=><div aria-labelledby={`human-tab-${tab}`} className={styles.tabState} hidden={active!==tab} id={`human-panel-${tab}`} key={tab} role="tabpanel">{active===tab?<><p id={locked?'human-profile-private':undefined}>{locked?labels.private:labels.unavailable}</p>{profile.isOwner?<Link href={`/${locale}/profile`}>{labels.profile}</Link>:null}</>:null}</div>)}
 </section>
}
