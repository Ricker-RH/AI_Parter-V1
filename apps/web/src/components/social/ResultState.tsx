import {EmptyState} from '@aifans/ui'
import type {SocialApiResult} from '../../lib/social-api'
import type {SocialLabels} from './types'

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
  return <div className="empty" role={result.status === 'unavailable' ? 'alert' : undefined}><EmptyState description={content.description} title={content.title} /></div>
}
