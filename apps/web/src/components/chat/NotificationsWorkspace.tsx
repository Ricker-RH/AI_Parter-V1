'use client'

import type {Notification, NotificationPage} from '@aifans/contracts'
import {useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {InboxWorkspaceFrame} from './InboxWorkspaceFrame'
import {NotificationDetail} from './NotificationDetail'
import {NotificationList, type NotificationWorkspaceLabels} from './NotificationList'
import styles from './MessagesWorkspace.module.css'

type ReadMutationState = {confirmed: boolean; pending: ReadonlySet<string>}
type ReadMutationStore = {scope: string | undefined; mutations: ReadonlyMap<string, ReadMutationState>}

export function updateReadMutation(current: ReadonlyMap<string, ReadMutationState>, notificationId: string, operationId: string, outcome: 'optimistic' | 'confirmed' | 'rollback') {
  const existing = current.get(notificationId) ?? {confirmed: false, pending: new Set<string>()}
  const pending = new Set(existing.pending)
  if (outcome === 'optimistic') pending.add(operationId)
  else pending.delete(operationId)
  const next = new Map(current)
  const confirmed = existing.confirmed || outcome === 'confirmed'
  if (!confirmed && pending.size === 0) next.delete(notificationId)
  else next.set(notificationId, {confirmed, pending})
  return next
}

export function NotificationsWorkspace({labels, listCursor, locale, result, selectedId, selectedResult, viewerScope}: {labels: NotificationWorkspaceLabels; listCursor?: string; locale: Locale; result: SocialApiResult<NotificationPage>; selectedId?: string; selectedResult?: SocialApiResult<Notification>; viewerScope?: string}) {
  const [readStore, setReadStore] = useState<ReadMutationStore>(() => ({scope: viewerScope, mutations: new Map()}))
  const readMutations = readStore.scope === viewerScope ? readStore.mutations : new Map<string, ReadMutationState>()
  const updateSelectedRead = (operationId: string, outcome: 'optimistic' | 'confirmed' | 'rollback') => {
    if (selectedId) setReadStore((current) => ({
      scope: viewerScope,
      mutations: updateReadMutation(current.scope === viewerScope ? current.mutations : new Map(), selectedId, operationId, outcome),
    }))
  }
  const readIds = new Set(Array.from(readMutations, ([id, state]) => state.confirmed || state.pending.size > 0 ? id : null).filter((id): id is string => id !== null))
  const listUnavailable = result.status === 'unavailable'
  const detail = selectedId && selectedResult && viewerScope
    ? <NotificationDetail labels={labels} locale={locale} notificationIdentity={selectedId} onOptimisticRead={(operationId) => updateSelectedRead(operationId, 'optimistic')} onRead={(_readAt, operationId) => updateSelectedRead(operationId, 'confirmed')} onReadError={(operationId) => updateSelectedRead(operationId, 'rollback')} result={selectedResult} viewerScope={viewerScope} {...(listCursor ? {listCursor} : {})}/>
    : selectedId && selectedResult
      ? <NotificationDetail labels={labels} locale={locale} notificationIdentity={selectedId} onOptimisticRead={() => undefined} onRead={() => undefined} onReadError={() => undefined} result={selectedResult} viewerScope="unavailable" {...(listCursor ? {listCursor} : {})}/>
      : listUnavailable
        ? null
        : <section className={styles.emptyPane}><div><h2>{labels.chat.selectNotification}</h2></div></section>
  return <InboxWorkspaceFrame detail={detail} list={<NotificationList labels={labels} locale={locale} readIds={readIds} result={result} {...(listCursor ? {listCursor} : {})} {...(selectedId ? {selectedId} : {})}/>} listUnavailable={listUnavailable} selected={Boolean(selectedId)}/>
}
