'use client'

import type {Notification} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect, useRef} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {NotificationReadButton} from '../social/NotificationReadButton'
import type {NotificationWorkspaceLabels} from './NotificationList'
import {notificationText} from './NotificationList'
import styles from './MessagesWorkspace.module.css'

const commentKinds = new Set<Notification['kind']>(['comment', 'reply', 'comment_like'])

export function notificationTargetHref(notification: Notification, locale: Locale) {
  if (notification.kind === 'follow') return notification.actor?.kind === 'ip' ? `/${locale}/profiles/${notification.actor.id}` : undefined
  if (!notification.postId) return undefined
  const postHref = `/${locale}/posts/${notification.postId}`
  return commentKinds.has(notification.kind) && notification.commentId ? `${postHref}#comment-${notification.commentId}` : postHref
}

type NotificationDetailProps = {
  labels: NotificationWorkspaceLabels
  listCursor?: string
  locale: Locale
  notificationIdentity: string
  onOptimisticRead(operationId: string): void
  onRead(readAt: string, operationId: string): void
  onReadError(operationId: string): void
  result: SocialApiResult<Notification>
  viewerScope: string
}

export function NotificationDetail({labels, listCursor, locale, notificationIdentity, onOptimisticRead, onRead, onReadError, result, viewerScope}: NotificationDetailProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const focusIdentity = result.status === 'ok' ? `ok:${result.data.id}` : `${result.status}:${notificationIdentity}`
  useEffect(() => {
    if (globalThis.matchMedia?.('(max-width: 699px)').matches) heading.current?.focus()
  }, [focusIdentity])
  const backQuery = listCursor ? `?${new URLSearchParams({cursor: listCursor})}` : ''
  if (result.status !== 'ok') return <section className={`${styles.detailPane} ${styles.notificationDetailPane}`}><header className={styles.detailHeader}><Link className={styles.back} href={`/${locale}/messages/notifications${backQuery}`}>← {labels.chat.back}</Link><h2 ref={heading} tabIndex={-1}>{labels.chat.notificationDetailTitle}</h2></header><p className={styles.detailNotice} role="alert">{labels.chat.notificationUnavailable}</p></section>
  const notification = result.data
  const actor = notification.actor
  const isFollow = notification.kind === 'follow'
  const profileAvailable = isFollow && actor?.kind === 'ip'
  const targetHref = notificationTargetHref(notification, locale)
  const targetLabel = isFollow ? labels.chat.notificationOpenProfile : labels.chat.notificationOpenPost
  return <section aria-label={labels.chat.notificationDetailTitle} className={`${styles.detailPane} ${styles.notificationDetailPane}`}>
    <header className={styles.detailHeader}><Link className={styles.back} href={`/${locale}/messages/notifications${backQuery}`}>← {labels.chat.back}</Link><h2 ref={heading} tabIndex={-1}>{labels.chat.notificationDetailTitle}</h2></header>
    <article className={styles.notificationDetail}>
      <div className={styles.notificationActor}><span aria-hidden="true" className={styles.detailAvatar}>{(actor?.displayName ?? labels.aifansActor).slice(0, 1).toUpperCase()}</span><div><strong>{actor?.displayName ?? labels.aifansActor}</strong>{actor ? <span>@{actor.username}</span> : null}</div></div>
      <p className={styles.notificationAction}>{notificationText(notification, labels)}</p>
      <time dateTime={notification.createdAt}>{new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeStyle: 'short'}).format(new Date(notification.createdAt))}</time>
      <div className={styles.notificationContext}><p>{profileAvailable ? labels.chat.notificationProfileContext : isFollow ? labels.chat.notificationActorContext : labels.chat.notificationPostContext}</p>{notification.commentId ? <span>{labels.comments}</span> : null}{targetHref ? <Link href={targetHref}>{targetLabel}</Link> : null}</div>
      {notification.readAt === null ? <NotificationReadButton auto errorLabel={labels.interactionError} label={labels.markRead} locale={locale} notificationId={notification.id} onOptimisticRead={onOptimisticRead} onRead={onRead} onReadError={onReadError} pendingLabel={labels.markingRead} readClassName={styles.readStatus} readLabel={labels.chat.notificationRead} retryLabel={labels.chat.notificationReadRetry} viewerScope={viewerScope}/> : <span className={styles.readStatus}>{labels.chat.notificationRead}</span>}
    </article>
  </section>
}
