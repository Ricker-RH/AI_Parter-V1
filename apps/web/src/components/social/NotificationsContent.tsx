import type {NotificationPage} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {NotificationReadButton} from './NotificationReadButton'

export function NotificationsContent({result, locale, labels, moreHref}: {result: SocialApiResult<NotificationPage>; locale: Locale; labels: SocialLabels; moreHref?: string | undefined}) {
  if (result.status !== 'ok') return <ResultState labels={labels} result={result} />
  if (result.data.items.length === 0) return <ResultState empty="notifications" labels={labels} result={{status: 'not-found'}} />
  const actions = {follow: labels.notificationFollow, post_like: labels.notificationPostLike, comment: labels.notificationComment, reply: labels.notificationReply, comment_like: labels.notificationCommentLike}
  return <div className="notification-list">{result.data.items.map((notification) => {
    const content = <><p><strong>{notification.actor?.displayName ?? labels.aifansActor}</strong> {actions[notification.kind]}</p><time dateTime={notification.createdAt}>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(notification.createdAt))}</time></>
    return <div className="notification-row" key={notification.id}>{notification.postId?<Link className="notification-link" href={`/${locale}/posts/${notification.postId}`}>{content}</Link>:content}{notification.readAt===null?<NotificationReadButton errorLabel={labels.interactionError} label={labels.markRead} locale={locale} notificationId={notification.id} pendingLabel={labels.markingRead}/>:null}</div>
  })}{result.data.nextCursor && moreHref ? <Link className="load-more" href={moreHref}>{labels.loadMore}</Link> : null}</div>
}
