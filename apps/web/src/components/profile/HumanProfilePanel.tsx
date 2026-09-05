'use client'
import {ProfileCover} from './ProfileCover'
import coverStyles from './ProfileCover.module.css'
import type {HumanProfile} from '@aifans/contracts'
import {QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import Link from 'next/link'
import {useContext, useEffect, useRef, useState,type CSSProperties} from 'react'
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
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import {humanProfileCacheKey, loadHumanProfile} from './profile-cache'

type Props = {initialProfile:HumanProfile;locale:Locale;socialLabels:SocialLabels;viewerScope?:string}

function HumanProfilePanelContent({initialProfile,locale,socialLabels,viewerScope}:Props){
 const [profile,setProfile]=useState(initialProfile),labels=humanProfileLabels(locale)
 const [serverProfile,setServerProfile]=useState(initialProfile)
 // Reset before committing a render, so refreshed privacy never paints stale tab content.
 if(serverProfile!==initialProfile){setServerProfile(initialProfile);setProfile(initialProfile)}
 const background=profile.background
 const backgroundStyle=background.type==='image'?{'--profile-background-image':`url("${background.url}")`,'--profile-background-focal-x':`${background.focalX*100}%`,'--profile-background-focal-y':`${background.focalY*100}%`} as CSSProperties:{'--profile-background-color':PROFILE_BACKGROUND_COLORS[background.colorKey]} as CSSProperties
 return <div className={styles.page}><div className={`${styles.pageContent} ${coverStyles.host}`} style={background.type==='color'?{'--profile-foreground':background.colorKey==='graphite'?PROFILE_BACKGROUND_COLORS.paper:PROFILE_BACKGROUND_COLORS.graphite} as CSSProperties:undefined}>
  <ProfilePageHeader actions={!profile.isOwner ? <HumanProfileBlockMenu locale={locale} onProfileChange={setProfile} profile={profile}/> : undefined} backHref={`/${locale}`} labels={{}} locale={locale} username={profile.identity.username}/>
  <div className={styles.surface} data-profile-cover-surface><div className={styles.profileBody}>
   <section aria-labelledby="human-profile-title" className={styles.profile} data-background-type={background.type} style={background.type==='color'?{'--profile-foreground':background.colorKey==='graphite'?PROFILE_BACKGROUND_COLORS.paper:PROFILE_BACKGROUND_COLORS.graphite} as CSSProperties:undefined}>
    <header className={styles.identityRow}><div className={styles.identityCopy}><h2 id="human-profile-title">{profile.identity.displayName}</h2><p>@{profile.identity.username}</p></div><Avatar avatarUrl={profile.identity.avatarUrl} className={styles.avatar!} displayName={profile.identity.displayName} size="large"/></header>
    {profile.bio?<div className={styles.details}><p className={styles.bio}>{profile.bio}</p></div>:null}
    {profile.isOwner?<Link className={styles.editAction} href={`/${locale}/profile`}>{labels.edit}</Link>:<HumanProfileActions key={profile.identity.id} locale={locale} onProfileChange={setProfile} profile={profile} showBlock={false}/>}
   </section>
   <HumanProfileTabs profile={profile} locale={locale} socialLabels={socialLabels} {...(viewerScope?{viewerScope}:{})}/>
 </div></div>
  <ProfileCover backgroundStyle={backgroundStyle} type={background.type}/>
 </div></div>
}

function CachedHumanProfilePanel(props: Props) {
 const queryClient=useQueryClient(),queryKey=humanProfileCacheKey(props.initialProfile.identity.id,props.viewerScope)
 const initialProfile=useRef(props.initialProfile)
 const hasPreview=queryClient.getQueryData(queryKey)!==undefined
 const query=useQuery({
  initialData:props.initialProfile,
  queryFn:({signal})=>loadHumanProfile(props.initialProfile.identity.id,signal),
  queryKey,
  refetchOnMount:hasPreview?'always':false,
  retry:false,
  staleTime:30_000,
 })
 useEffect(()=>{
  if(initialProfile.current===props.initialProfile)return
  initialProfile.current=props.initialProfile
  queryClient.setQueryData(queryKey,props.initialProfile)
 },[props.initialProfile,queryClient,queryKey])
 return <HumanProfilePanelContent {...props} initialProfile={query.data??props.initialProfile}/>
}

export function HumanProfilePanel(props:Props){
 const shared=useContext(AppQueryContext)
 const [client]=useState(createAppQueryClient)
 const content=<CachedHumanProfilePanel {...props}/>
 return shared?content:<QueryClientProvider client={client}>{content}</QueryClientProvider>
}
