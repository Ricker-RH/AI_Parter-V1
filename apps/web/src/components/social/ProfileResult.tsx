import type {PublicIp} from '@aifans/contracts'
import Link from 'next/link'
import type {ReactNode} from 'react'
import type {SocialLabels} from './types'

export function ProfileResult({action, compact = false, followerCount, href, labels, profile}: {action?: ReactNode; compact?: boolean; followerCount?: number; href: string; labels: SocialLabels; profile: PublicIp}) {
  if (compact) return <article className="profile-result profile-result--compact">
    <Link aria-label={profile.displayName} className="profile-result-avatar" href={href}>{profile.displayName.slice(0, 1)}</Link>
    <div className="profile-result-content">
      <p className="profile-result-handle"><Link href={href}>@{profile.username}</Link></p>
      <h3 className="profile-result-name"><Link href={href}>{profile.displayName}</Link></h3>
      <p className="profile-result-followers">{followerCount === undefined ? `— ${labels.followers}` : `${followerCount} ${labels.followers}`}</p>
    </div>
    {action}
  </article>
  return <article className="profile-result">
    <Link aria-label={profile.displayName} className="profile-result-avatar" href={href}>{profile.displayName.slice(0, 1)}</Link>
    <div className="profile-result-content">
      <div className="profile-result-heading"><h3><Link href={href}>{profile.displayName}</Link></h3>{action}</div>
      <p className="author-meta">@{profile.username}</p>
      {profile.bio ? <p className="profile-result-bio">{profile.bio}</p> : null}
      {profile.creator ? <p className="creator-attribution">{labels.createdBy} @{profile.creator.username}</p> : null}
    </div>
  </article>
}
