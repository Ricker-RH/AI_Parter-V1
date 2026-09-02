import type {PublicIpProfile} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {PostCard} from './PostCard'
import {ProfileFollowButton} from './ProfileFollowButton'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {StartChatButton} from '../chat/StartChatButton'
import {EmptyState} from '@aifans/ui'
import styles from './PublicProfileContent.module.css'

export function PublicProfileContent({result,locale,labels,moreHref}: {result:SocialApiResult<PublicIpProfile>;locale:Locale;labels:SocialLabels;moreHref?:string}) {
  if(result.status!=='ok') return <div className={styles.resultState}><ResultState labels={labels} profile result={result}/></div>
  const {profile,followerCount,viewerFollows,posts}=result.data
  const returnTo=`/${locale}/profiles/${profile.id}`
  return <div className={styles.profile}>
    <header className={styles.contextualTitle}><h1>{profile.username}</h1></header>
    <div className={styles.profileSurface}>
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
        <div className={styles.followAction}>{viewerFollows===undefined?<Link href={`/${locale}/auth/sign-in?next=${encodeURIComponent(returnTo)}`}>{labels.follow}</Link>:<ProfileFollowButton following={viewerFollows} labels={labels} locale={locale} profileId={profile.id}/>}</div>
        <div className={styles.chatAction}><StartChatButton authenticated={viewerFollows!==undefined} ipProfileId={profile.id} labels={{startChat: labels.startChat, startingChat: labels.startingChat, chatStartError: labels.chatStartError}} locale={locale}/></div>
      </div>
    </section>
    <section aria-labelledby="profile-posts-heading" className={styles.postsSection}>
      <div className={styles.tabList}><h2 className={styles.tab} id="profile-posts-heading">{labels.posts}</h2></div>
      <div>{posts.items.length?posts.items.map(post=><PostCard canMutate key={post.id} labels={labels} locale={locale} post={post}/>):<div className={styles.empty}><EmptyState description={labels.homeEmptyDescription} title={labels.homeEmptyTitle}/></div>}{posts.nextCursor&&moreHref?<Link className={styles.loadMore} href={moreHref}>{labels.loadMore}</Link>:null}</div>
    </section>
    </div>
  </div>
}
