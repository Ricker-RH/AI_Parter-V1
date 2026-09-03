import type {Locale} from '../../../../i18n/config'
import {getMessages} from '../../../../i18n/config'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../../lib/auth/access-policy'
import {fetchNotification, fetchNotifications} from '../../../../lib/social-api'
import {NotificationsWorkspace} from '../../../../components/chat/NotificationsWorkspace'

export async function renderNotificationWorkspace({cursor, locale, notificationId}: {cursor?: string; locale: Locale; notificationId?: string}) {
  const returnQuery = cursor ? `?${new URLSearchParams({[notificationId ? 'listCursor' : 'cursor']: cursor})}` : ''
  const returnTo = `/${locale}/messages/notifications${notificationId ? `/${notificationId}` : ''}${returnQuery}`
  const [access, labels] = await Promise.all([
    requireAuthenticatedPage({locale, returnTo}),
    getMessages(locale),
  ])
  if (access.status === 'unavailable') return <NotificationsWorkspace labels={labels} locale={locale} result={{status: 'unavailable'}} {...(cursor ? {listCursor: cursor} : {})} {...(notificationId ? {selectedId: notificationId, selectedResult: {status: 'unavailable'} as const} : {})}/>
  const [result, selectedResult] = await Promise.all([
    fetchNotifications({...(cursor ? {cursor} : {}), token: access.token}),
    notificationId ? fetchNotification(notificationId, {token: access.token}) : Promise.resolve(undefined),
  ])
  if (result.status === 'auth-required' || selectedResult?.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  return <NotificationsWorkspace labels={labels} locale={locale} result={result} viewerScope={access.viewerScope} {...(cursor ? {listCursor: cursor} : {})} {...(notificationId && selectedResult ? {selectedId: notificationId, selectedResult} : {})}/>
}
