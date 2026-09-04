import type {PublicIpProfile} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {ProfileFollowButton} from './ProfileFollowButton'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {StartChatButton} from '../chat/StartChatButton'
import styles from './PublicProfileContent.module.css'
import {PublicProfileTabs} from './PublicProfileTabs'
import {ProfilePageHeader} from '../profile/ProfilePageHeader'
import {IpProfileShareAction} from './IpProfileShareAction'

export function PublicProfileContent({result,locale,labels,moreHref,viewerScope}: {result:SocialApiResult<PublicIpProfile>;locale:Locale;labels:SocialLabels;moreHref?:string;viewerScope?:string}) {
  if(result.status!=='ok') return <div className={styles.resultState}><ResultState labels={labels} profile result={result}/></div>
  const {profile,followerCount,viewerFollows,posts}=result.data
  const referenceTime=Date.now()
  const returnTo=`/${locale}/profiles/${profile.id}`
  return <div className={styles.profile}>
    <ProfilePageHeader actions={<IpProfileShareAction locale={locale} profile={profile}/>} backHref={`/${locale}`} labels={labels} locale={locale} username={profile.username}/>
    <div className={styles.profileSurface} data-profile-content-frame>
    <section className={styles.header} aria-labelledby="profile-display-name">
      <div className={styles.identityRow}>
        <div className={styles.identity}>
          <h2 id="profile-display-name">{profile.displayName}</h2>
          <p className={styles.username}>@{profile.username}</p>
          {profile.creator?<p className={styles.creator}>{labels.createdBy} @{profile.creator.username}</p>:null}
        </div>
        <div className={styles.avatar} aria-hidden="true">{profile.displayName.slice(0,1)}</div>
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
  </div>
}
