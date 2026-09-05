'use client'
import {ProfileCover} from '../profile/ProfileCover'
import coverStyles from '../profile/ProfileCover.module.css'

import type {PublicIpProfile} from '@aifans/contracts'
import {QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import Link from 'next/link'
import {useContext, useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {ProfileFollowButton} from './ProfileFollowButton'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {StartChatButton} from '../chat/StartChatButton'
import styles from './PublicProfileContent.module.css'
import {PublicProfileTabs} from './PublicProfileTabs'
import {ProfilePageHeader} from '../profile/ProfilePageHeader'
import {Avatar} from '../account/Avatar'
import {IpProfileShareAction} from './IpProfileShareAction'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import {ipProfileCacheKey, loadIpProfile} from '../profile/profile-cache'

type Props = {result:SocialApiResult<PublicIpProfile>;locale:Locale;labels:SocialLabels;moreHref?:string;viewerScope?:string}

function PublicProfileContentView({result,locale,labels,moreHref,viewerScope}: Props) {
  if(result.status!=='ok') return <div className={styles.resultState}><ResultState labels={labels} profile result={result}/></div>
  const {profile,followerCount,viewerFollows,posts}=result.data
  const referenceTime=Date.now()
  const returnTo=`/${locale}/profiles/${profile.id}`
  return <div className={`${styles.profile} ${coverStyles.host}`}>
    <ProfilePageHeader actions={<IpProfileShareAction locale={locale} profile={profile}/>} backHref={`/${locale}`} labels={labels} locale={locale} username={profile.username}/>
    <div className={styles.profileSurface} data-profile-content-frame data-profile-cover-surface>
    <section className={styles.header} aria-labelledby="profile-display-name">
      <div className={styles.identityRow}>
        <div className={styles.identity}>
          <h2 id="profile-display-name">{profile.displayName}</h2>
          <p className={styles.username}>@{profile.username}</p>
          {profile.creator?<p className={styles.creator}>{labels.createdBy} @{profile.creator.username}</p>:null}
        </div>
        <Avatar avatarUrl={null} {...(styles.avatar ? {className: styles.avatar} : {})} decorative displayName={profile.displayName} identityId={profile.id} kind="ip" size="large"/>
      </div>
      {profile.bio?<p className={styles.bio}>{profile.bio}</p>:null}
      <p className={styles.followers}>{followerCount} {labels.followers}</p>
      <div className={styles.profileActions}>
        <div className={styles.followAction}>{viewerFollows===undefined || !viewerScope?<Link href={`/${locale}/auth/sign-in?next=${encodeURIComponent(returnTo)}`}>{labels.follow}</Link>:<ProfileFollowButton following={viewerFollows} labels={labels} locale={locale} profileId={profile.id} viewerScope={viewerScope}/>}</div>
        <div className={styles.chatAction}><StartChatButton authenticated={viewerFollows!==undefined} ipProfileId={profile.id} labels={{startChat: labels.startChat, startingChat: labels.startingChat, chatStartError: labels.chatStartError}} locale={locale}/></div>
      </div>
    </section>
    <PublicProfileTabs canMutate={Boolean(viewerScope)} labels={labels} locale={locale} posts={posts} profileId={profile.id} referenceTime={referenceTime} returnTo={returnTo} {...(viewerScope ? {viewerScope} : {})}/>
    </div>
    <ProfileCover/>
  </div>
}

function CachedPublicProfileContent(props: Props) {
  const initial = props.result.status === 'ok' ? props.result.data : null
  const queryClient = useQueryClient()
  const queryKey = initial ? ipProfileCacheKey(initial.profile.id, props.viewerScope) : ['ip-profile-preview', props.viewerScope ?? 'guest', 'unavailable'] as const
  const initialResult = useRef(initial)
  const hasPreview = initial !== null && queryClient.getQueryData(queryKey) !== undefined
  const query = useQuery({
    enabled: initial !== null,
    initialData: initial ?? undefined,
    queryFn: ({signal}) => loadIpProfile(initial!.profile.id, signal),
    queryKey,
    refetchOnMount: hasPreview ? 'always' : false,
    retry: false,
    staleTime: 30_000,
  })
  useEffect(() => {
    if (initialResult.current === initial) return
    initialResult.current = initial
    if (initial) queryClient.setQueryData(queryKey, initial)
  }, [initial, queryClient, queryKey])
  const result = initial === null ? props.result : {status: 'ok' as const, data: query.data ?? initial}
  return <PublicProfileContentView {...props} result={result}/>
}

export function PublicProfileContent(props: Props) {
  const shared = useContext(AppQueryContext)
  const [client] = useState(createAppQueryClient)
  const content = <CachedPublicProfileContent {...props}/>
  return shared ? content : <QueryClientProvider client={client}>{content}</QueryClientProvider>
}
