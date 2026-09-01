import type {PublicIpProfile} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {PostCard} from './PostCard'
import {ProfileFollowButton} from './ProfileFollowButton'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'

export function PublicProfileContent({result,locale,labels,moreHref}: {result:SocialApiResult<PublicIpProfile>;locale:Locale;labels:SocialLabels;moreHref?:string}) {
  if(result.status!=='ok') return <ResultState labels={labels} profile result={result}/>
  const {profile,followerCount,viewerFollows,posts}=result.data
  return <div><section className="public-profile"><div className="avatar" aria-hidden="true">{profile.displayName.slice(0,1)}</div><div><h1>{profile.displayName}</h1><p className="author-meta">@{profile.username} · {labels[profile.visualType]}</p>{profile.creator?<p className="creator-attribution">{labels.createdBy} @{profile.creator.username}</p>:null}</div><p>{profile.bio}</p><p>{followerCount} {labels.followers}</p>{viewerFollows===undefined?<Link href={`/${locale}/auth/sign-in?next=${encodeURIComponent(`/${locale}/profiles/${profile.id}`)}`}>{labels.follow}</Link>:<ProfileFollowButton following={viewerFollows} labels={labels} locale={locale} profileId={profile.id}/>}</section><section aria-labelledby="profile-posts"><h2 className="section-title" id="profile-posts">{labels.posts}</h2>{posts.items.length?posts.items.map(post=><PostCard canMutate key={post.id} labels={labels} locale={locale} post={post}/>):<div className="empty"><p>{labels.homeEmptyDescription}</p></div>}{posts.nextCursor&&moreHref?<Link className="load-more" href={moreHref}>{labels.loadMore}</Link>:null}</section></div>
}
