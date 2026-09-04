'use client'
import type {ChatConversationSummary, ChatHistoryPage} from '@aifans/contracts'
import {useEffect, useRef} from 'react'
import {useRouter} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {ConversationDetail, type ConversationDetailLabels} from './ConversationDetail'
import {ConversationList, type ConversationListLabels} from './ConversationList'
import {MessagesSectionHeader} from './MessagesSectionHeader'
import {InboxWorkspaceFrame} from './InboxWorkspaceFrame'
import {useOptionalCurrentAccount} from '../account/CurrentAccountProvider'
import {HumanMessagesWorkspace} from './HumanMessagesWorkspace'
import {UnavailableRetry} from '../social/UnavailableRetry'
import styles from './MessagesWorkspace.module.css'

export type MessagesLabels = ConversationListLabels & ConversationDetailLabels & {selectConversation: string}

export type MessagesWorkspaceProps = {items: ChatConversationSummary[]; labels: MessagesLabels; locale: Locale; snapshotViewerStatus?: 'authenticated' | 'unavailable' | undefined; snapshotViewerId?: string | undefined; selectedId?: string | undefined; selectedHumanId?: string | undefined; history?: ChatHistoryPage | undefined; initialCursor?: string | undefined; nextCursor?: string | null | undefined; listUnavailable?: boolean | undefined; detailUnavailable?: boolean | undefined}
export function MessagesWorkspace(props: MessagesWorkspaceProps) {
  const current=useOptionalCurrentAccount()
  const router=useRouter()
  const refreshed=useRef<string | null>(null)
  const hasPrivateSnapshot=props.items.length>0 || Boolean(props.history)
  const viewerUnavailable=props.snapshotViewerStatus==='unavailable'
  const matches=!viewerUnavailable && (!current || (current.status==='authenticated' && current.account && (!hasPrivateSnapshot || current.account.id===props.snapshotViewerId)))
  useEffect(()=>{
    if (viewerUnavailable || !current || matches || current.status==='loading' || current.status==='unavailable') return
    const key=`${props.snapshotViewerId ?? 'unknown'}:${current.account?.id ?? 'anonymous'}:${current.status}`
    if (refreshed.current!==key) {refreshed.current=key;router.refresh()}
  },[current?.account?.id,current?.status,matches,props.snapshotViewerId,router,viewerUnavailable])
  if (!matches) return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="chat" labels={props.labels} locale={props.locale}/><div className={styles.unavailableState}><p role={current?.status==='loading' ? 'status' : 'alert'}>{current?.status==='loading' ? props.labels.loadingMore : props.labels.unavailable}</p><UnavailableRetry beforeRetry={current?.refetch} disabled={current?.status==='loading'} label={props.labels.unavailableAction} pendingLabel={props.labels.unavailablePending}/></div></aside>}/>
  if (current?.status==='authenticated' && current.account?.kind==='human') return <HumanMessagesWorkspace key={current.account.id} {...props} selfProfileId={current.account.id}/>
  return <AiMessagesWorkspace {...props}/>
}
function AiMessagesWorkspace({items, labels, locale, selectedId, history, initialCursor, nextCursor, listUnavailable = false, detailUnavailable = false}: MessagesWorkspaceProps) {
  const mobileHeader = <div className={styles.mobileDetailSectionHeader}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/></div>
  return <InboxWorkspaceFrame detail={selectedId ? <ConversationDetail history={history} labels={labels} listCursor={initialCursor} locale={locale} sectionHeader={mobileHeader} unavailable={detailUnavailable}/> : listUnavailable ? null : <section className={styles.emptyPane}><div><h2>{labels.selectConversation}</h2></div></section>} list={<ConversationList initialCursor={initialCursor} items={items} labels={labels} locale={locale} nextCursor={nextCursor} selectedId={selectedId} unavailable={listUnavailable}/>} listUnavailable={listUnavailable} selected={Boolean(selectedId)}/>
}
