'use client'
import type {HumanProfile} from '@aifans/contracts'
import Link from 'next/link'
import {useState,type CSSProperties} from 'react'
import type {Locale} from '../../i18n/config'
import {Avatar} from '../account/Avatar'
import {ProfilePageHeader} from './ProfilePageHeader'
import {PROFILE_BACKGROUND_COLORS} from './ProfileEditor'
import {HumanProfileActions} from './HumanProfileActions'
import {HumanProfileBlockMenu} from './HumanProfileBlockMenu'
import {humanProfileLabels} from './human-profile-labels'
import {HumanProfileTabs} from './HumanProfileTabs'
import type {SocialLabels} from '../social/types'
import styles from './MyProfilePanel.module.css'

export function HumanProfilePanel({initialProfile,locale,socialLabels,viewerScope}:{initialProfile:HumanProfile;locale:Locale;socialLabels:SocialLabels;viewerScope?:string}){
 const [profile,setProfile]=useState(initialProfile),labels=humanProfileLabels(locale)
 const [serverProfile,setServerProfile]=useState(initialProfile)
 // Reset before committing a render, so refreshed privacy never paints stale tab content.
 if(serverProfile!==initialProfile){setServerProfile(initialProfile);setProfile(initialProfile)}
 const background=profile.background
 const backgroundStyle=background.type==='image'?{'--profile-background-image':`url("${background.url}")`,'--profile-background-focal-x':`${background.focalX*100}%`,'--profile-background-focal-y':`${background.focalY*100}%`} as CSSProperties:{'--profile-background-color':PROFILE_BACKGROUND_COLORS[background.colorKey]} as CSSProperties
 return <div className={styles.page}><div className={styles.pageContent}>
  <ProfilePageHeader actions={!profile.isOwner ? <HumanProfileBlockMenu locale={locale} onProfileChange={setProfile} profile={profile}/> : undefined} backHref={`/${locale}`} labels={{}} locale={locale} username={profile.identity.username}/>
  <div className={styles.surface}><div className={styles.profileBody}>
   <section aria-labelledby="human-profile-title" className={styles.profile} data-background-type={background.type} style={background.type==='color'?{'--profile-foreground':background.colorKey==='graphite'?PROFILE_BACKGROUND_COLORS.paper:PROFILE_BACKGROUND_COLORS.graphite} as CSSProperties:undefined}>
    <div aria-hidden="true" className={styles.profileBackground} style={backgroundStyle}/>
    <header className={styles.identityRow}><div className={styles.identityCopy}><h2 id="human-profile-title">{profile.identity.displayName}</h2><p>@{profile.identity.username}</p></div><Avatar avatarUrl={profile.identity.avatarUrl} className={styles.avatar!} displayName={profile.identity.displayName} size="large"/></header>
    {profile.bio?<div className={styles.details}><p className={styles.bio}>{profile.bio}</p></div>:null}
    {profile.isOwner?<Link className={styles.editAction} href={`/${locale}/profile`}>{labels.edit}</Link>:<HumanProfileActions key={profile.identity.id} locale={locale} onProfileChange={setProfile} profile={profile} showBlock={false}/>}
   </section>
   <HumanProfileTabs profile={profile} locale={locale} socialLabels={socialLabels} {...(viewerScope?{viewerScope}:{})}/>
  </div></div>
 </div></div>
}
