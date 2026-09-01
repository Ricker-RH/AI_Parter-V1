import {EmptyState} from '@aifans/ui'
import type {SocialApiResult} from '../../lib/social-api'
import type {SocialLabels} from './types'
import {UnavailableRetry} from './UnavailableRetry'

export function ResultState({result, labels, empty, profile=false}: {result: Exclude<SocialApiResult<unknown>, {status: 'ok'}>; labels: SocialLabels; empty?: 'bookmarks' | 'liked' | 'notifications' | 'home';profile?:boolean}) {
  const content = empty === 'bookmarks'
    ? {title: labels.bookmarksEmptyTitle, description: labels.bookmarksEmptyDescription}
    : empty === 'liked'
      ? {title: labels.likedEmptyTitle ?? labels.bookmarksEmptyTitle, description: labels.likedEmptyDescription ?? labels.bookmarksEmptyDescription}
      : empty === 'notifications'
      ? {title: labels.notificationsEmptyTitle, description: labels.notificationsEmptyDescription}
      : empty === 'home'
        ? {title: labels.homeEmptyTitle, description: labels.homeEmptyDescription}
        : result.status === 'auth-required'
    ? {title: labels.authRequiredTitle, description: labels.authRequiredDescription}
    : result.status === 'not-found'
      ? profile?{title:labels.profileNotFoundTitle,description:labels.profileNotFoundDescription}:{title: labels.postNotFoundTitle, description: labels.postNotFoundDescription}
      : {title: labels.unavailableTitle, description: labels.unavailableDescription}
  const unavailable = result.status === 'unavailable'
  return <div className="empty" role={unavailable ? 'alert' : undefined}><EmptyState description={content.description} title={content.title} />{unavailable ? <UnavailableRetry label={labels.unavailableRetry} pendingLabel={labels.unavailableRetrying} /> : null}</div>
}
