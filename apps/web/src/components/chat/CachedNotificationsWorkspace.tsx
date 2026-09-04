'use client'

import {NotificationPageSchema, NotificationSchema, type Notification, type NotificationPage} from '@aifans/contracts'
import {useQuery} from '@tanstack/react-query'
import {useEffect, useRef} from 'react'
import {useRouter} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import type {SocialApiResult} from '../../lib/social-api'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import {InboxWorkspaceFrame} from './InboxWorkspaceFrame'
import {MessagesSectionHeader} from './MessagesSectionHeader'
import {NotificationsWorkspace} from './NotificationsWorkspace'
import type {NotificationWorkspaceLabels} from './NotificationList'
import styles from './MessagesWorkspace.module.css'

type NotificationResult = SocialApiResult<NotificationPage>
type DetailResult = SocialApiResult<Notification>

async function loadList(cursor?: string, signal?: AbortSignal): Promise<NotificationResult> {
  const query = cursor ? `?${new URLSearchParams({cursor})}` : ''
  try {
    const response = await fetch(`/api/notifications${query}`, {cache: 'no-store', credentials: 'same-origin', ...(signal ? {signal} : {})})
    if (response.status === 401) { await response.body?.cancel(); return {status: 'auth-required'} }
    if (!response.ok) { await response.body?.cancel(); return {status: 'unavailable'} }
    const parsed = NotificationPageSchema.safeParse(await response.json() as unknown)
    return parsed.success ? {status: 'ok', data: parsed.data} : {status: 'unavailable'}
  } catch (error) { if ((error as Error).name === 'AbortError') throw error; return {status: 'unavailable'} }
}

async function loadDetail(notificationId: string, signal?: AbortSignal): Promise<DetailResult> {
  try {
    const response = await fetch(`/api/notifications/${notificationId}`, {cache: 'no-store', credentials: 'same-origin', ...(signal ? {signal} : {})})
    if (response.status === 401) { await response.body?.cancel(); return {status: 'auth-required'} }
    if (!response.ok) { await response.body?.cancel(); return {status: 'unavailable'} }
    const parsed = NotificationSchema.safeParse(await response.json() as unknown)
    return parsed.success ? {status: 'ok', data: parsed.data} : {status: 'unavailable'}
  } catch (error) { if ((error as Error).name === 'AbortError') throw error; return {status: 'unavailable'} }
}

function returnTo(locale: Locale, notificationId?: string, cursor?: string) {
  const query = cursor ? `?${new URLSearchParams({[notificationId ? 'listCursor' : 'cursor']: cursor})}` : ''
  return `/${locale}/messages/notifications${notificationId ? `/${notificationId}` : ''}${query}`
}

export function CachedNotificationsWorkspace({cursor, labels, locale, selectedId}: {cursor?: string; labels: NotificationWorkspaceLabels; locale: Locale; selectedId?: string}) {
  const {account, status} = useCurrentAccount()
  const router = useRouter()
  const redirected = useRef(false)
  const scope = account ? `${account.kind}:${account.id}` : 'anonymous'
  const destination = returnTo(locale, selectedId, cursor)
  const list = useQuery({enabled: status === 'authenticated' && Boolean(account), queryKey: ['notifications', scope, locale, 'list', cursor ?? null], queryFn: ({signal}) => loadList(cursor, signal), staleTime: 30_000})
  const detail = useQuery({enabled: status === 'authenticated' && Boolean(account) && Boolean(selectedId), queryKey: ['notifications', scope, locale, 'detail', selectedId ?? null], queryFn: ({signal}) => loadDetail(selectedId!, signal), staleTime: 30_000})

  useEffect(() => {
    if (status !== 'anonymous' || redirected.current) return
    redirected.current = true
    router.replace(authHref(locale, destination))
  }, [destination, locale, router, status])

  if (status === 'loading') return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="notifications" labels={labels.chat} locale={locale}/><p className={styles.detailNotice} role="status">{labels.chat.loadingMore}</p></aside>}/>
  if (status === 'unavailable' || status === 'anonymous' || !account) return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="notifications" labels={labels.chat} locale={locale}/><p className={styles.detailNotice} role="alert">{labels.unavailableTitle}</p></aside>}/>
  if (list.isPending && !list.data) return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="notifications" labels={labels.chat} locale={locale}/><p className={styles.detailNotice} role="status">{labels.chat.loadingMore}</p></aside>}/>

  const listResult = list.data ?? {status: 'unavailable' as const}
  const detailResult = selectedId ? detail.data ?? (detail.isPending ? undefined : {status: 'unavailable' as const}) : undefined
  return <NotificationsWorkspace labels={labels} locale={locale} result={listResult} viewerScope={scope} {...(cursor ? {listCursor: cursor} : {})} {...(selectedId ? {selectedId} : {})} {...(detailResult ? {selectedResult: detailResult} : {})}/>
}
