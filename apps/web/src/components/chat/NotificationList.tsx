import type {Notification, NotificationPage} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import type {SocialLabels} from '../social/types'
import {UnavailableRetry} from '../social/UnavailableRetry'
import {MessagesSectionHeader, type MessagesSectionLabels} from './MessagesSectionHeader'
import styles from './MessagesWorkspace.module.css'

export type NotificationWorkspaceLabels = SocialLabels & {chat: MessagesSectionLabels & {
  back: string
  notificationActorContext: string
  notificationDetailTitle: string
  notificationListLabel: string
  notificationOpenPost: string
  notificationOpenProfile: string
  notificationPostContext: string
  notificationProfileContext: string
  notificationRead: string
  notificationReadRetry: string
  notificationUnavailable: string
  notificationUnread: string
  selectNotification: string
}}

const actions = (labels: SocialLabels) => ({follow: labels.notificationFollow, post_like: labels.notificationPostLike, comment: labels.notificationComment, reply: labels.notificationReply, comment_like: labels.notificationCommentLike})

export function notificationText(notification: Notification, labels: SocialLabels) {
  return `${notification.actor?.displayName ?? labels.aifansActor} ${actions(labels)[notification.kind]}`
}

export function NotificationList({listCursor, labels, locale, readIds, result, selectedId}: {listCursor?: string; labels: NotificationWorkspaceLabels; locale: Locale; readIds: ReadonlySet<string>; result: SocialApiResult<NotificationPage>; selectedId?: string}) {
  return <aside aria-label={labels.chat.notificationListLabel} className={styles.listPane}>
    <MessagesSectionHeader active="notifications" labels={labels.chat} locale={locale}/>
    {result.status === 'unavailable' ? <div className={styles.unavailableState} role="alert"><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M24 7v20"/><path d="M24 36.5v.5"/><circle cx="24" cy="24" r="18"/></svg><h2>{labels.unavailableTitle}</h2><p>{labels.unavailableDescription}</p><UnavailableRetry label={labels.unavailableRetry} pendingLabel={labels.unavailableRetrying}/></div> : null}
    {result.status === 'ok' && result.data.items.length === 0 ? <div className={styles.inboxEmpty}><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M15 19a9 9 0 0 1 18 0c0 10 4 11 4 11H11s4-1 4-11Z"/><path d="M20 35h8"/></svg><h2>{labels.notificationsEmptyTitle}</h2><p>{labels.notificationsEmptyDescription}</p></div> : null}
    {result.status === 'ok' && result.data.items.length > 0 ? <nav aria-label={labels.chat.notificationListLabel} className={styles.notificationList}>{result.data.items.map((notification) => {
      const read = notification.readAt !== null || readIds.has(notification.id)
      const query = listCursor ? `?${new URLSearchParams({listCursor})}` : ''
      return <Link aria-current={notification.id === selectedId ? 'page' : undefined} className={styles.notificationRow} href={`/${locale}/messages/notifications/${notification.id}${query}`} key={notification.id}>
        <span aria-hidden="true" className={styles.avatar}>{(notification.actor?.displayName ?? labels.aifansActor).slice(0, 1).toUpperCase()}</span>
        <span className={styles.notificationCopy}><strong>{notificationText(notification, labels)}</strong><time dateTime={notification.createdAt}>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(notification.createdAt))}</time>{read ? null : <span className={styles.unreadLabel}>{labels.chat.notificationUnread}</span>}</span>
      </Link>
    })}{result.data.nextCursor ? <Link className={styles.moreLink} href={`/${locale}/messages/notifications?${new URLSearchParams({cursor: result.data.nextCursor})}`}>{labels.loadMore}</Link> : null}</nav> : null}
  </aside>
}
