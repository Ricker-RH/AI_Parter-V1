import type {PublicIp} from '@aifans/contracts'
import Link from 'next/link'
import type {ReactNode} from 'react'
import type {SocialLabels} from './types'

export function ProfileResult({action, href, labels, profile}: {action?: ReactNode; href: string; labels: SocialLabels; profile: PublicIp}) {
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
