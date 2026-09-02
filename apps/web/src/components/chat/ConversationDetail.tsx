'use client'

import {ChatHistoryPageSchema, type ChatHistoryPage, type ChatMessage} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {ChatComposer, type ChatComposerLabels} from './ChatComposer'
import styles from './MessagesWorkspace.module.css'

export type ConversationDetailLabels = ChatComposerLabels & {back: string; emptyHistory: string; loadEarlierMessages: string; unavailable: string}

function orderedUnique(messages: ChatMessage[]) { return [...new Map(messages.map((message) => [message.id, message])).values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)) }

type ConversationDetailProps = {history?: ChatHistoryPage | undefined; labels: ConversationDetailLabels; locale: Locale; unavailable?: boolean | undefined}

export function ConversationDetail(props: ConversationDetailProps) {
  return <ConversationDetailContent key={props.history?.conversation.id ?? 'unavailable'} {...props}/>
}

function ConversationDetailContent({history, labels, locale, unavailable = false}: ConversationDetailProps) {
  const [items, setItems] = useState<ChatMessage[]>(history?.items ?? [])
  const [nextCursor, setNextCursor] = useState(history?.nextCursor ?? null)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [earlierError, setEarlierError] = useState(false)
  const conversationId = useRef(history?.conversation.id)
  const loadingRef = useRef(false)
  const mounted = useRef(true)
  const earlierOperation = useRef(0)
  const earlierController = useRef<AbortController | null>(null)
  useEffect(() => {
    const nextConversationId = history?.conversation.id
    const changedConversation = conversationId.current !== nextConversationId
    if (changedConversation) {
      earlierOperation.current += 1
      earlierController.current?.abort()
      earlierController.current = null
      loadingRef.current = false
    }
    conversationId.current = nextConversationId
    if (!history) { setItems([]); setNextCursor(null); setLoadingEarlier(false); setEarlierError(false); return }
    if (changedConversation) { setItems(orderedUnique(history.items)); setNextCursor(history.nextCursor); setEarlierError(false) }
  }, [history])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      earlierOperation.current += 1
      earlierController.current?.abort()
      earlierController.current = null
      loadingRef.current = false
    }
  }, [])
  async function cancelBody(response: Response) { try { await response.body?.cancel() } catch {} }
  async function loadEarlier() {
    const cursor = nextCursor
    if (!history || !cursor || loadingRef.current) return
    const id = earlierOperation.current + 1
    const targetConversationId = history.conversation.id
    earlierOperation.current = id
    loadingRef.current = true
    setLoadingEarlier(true)
    setEarlierError(false)
    const request = new AbortController()
    earlierController.current = request
    const current = () => mounted.current && earlierOperation.current === id && conversationId.current === targetConversationId && !request.signal.aborted
    const ownsRequest = () => earlierOperation.current === id && earlierController.current === request
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(targetConversationId)}/messages?${new URLSearchParams({cursor})}`, {method: 'GET', signal: request.signal})
      if (!current()) { await cancelBody(response); return }
      if (response.status === 401) { await cancelBody(response); if (current()) globalThis.location.assign(authHref(locale, `/${locale}/messages/${targetConversationId}`)); return }
      if (!response.ok) { await cancelBody(response); if (!current()) return; throw Error('unavailable') }
      const value: unknown = await response.json()
      if (!current()) return
      const parsed = ChatHistoryPageSchema.safeParse(value)
      if (!parsed.success || parsed.data.conversation.id !== targetConversationId) throw Error('unavailable')
      setItems((current) => orderedUnique([...parsed.data.items, ...current]))
      setNextCursor(parsed.data.nextCursor)
    } catch (error) {
      if (current() && (error as Error).name !== 'AbortError') setEarlierError(true)
    } finally {
      if (!ownsRequest()) return
      loadingRef.current = false
      earlierController.current = null
      if (mounted.current) setLoadingEarlier(false)
    }
  }
  if (unavailable || !history) return <section className={styles.detailPane}><p className={styles.detailNotice} role="alert">{labels.unavailable}</p></section>
  return <section aria-label={history.conversation.ipProfile.displayName} className={styles.detailPane}>
    <header className={styles.detailHeader}><Link aria-label={labels.back} className={styles.back} href={`/${locale}/messages`}>← {labels.back}</Link><div className={styles.detailIdentity}><span aria-hidden="true" className={styles.avatar}>{history.conversation.ipProfile.displayName.slice(0, 1).toUpperCase()}</span><div><h2>{history.conversation.ipProfile.displayName}</h2><p>@{history.conversation.ipProfile.username}</p></div></div></header>
    <div className={styles.messageArea}>{nextCursor ? <button className={styles.older} disabled={loadingEarlier} onClick={() => void loadEarlier()} type="button">{labels.loadEarlierMessages}</button> : null}{earlierError ? <p className={styles.detailNotice} role="alert">{labels.unavailable}</p> : null}{items.length === 0 ? <p className={styles.detailNotice}>{labels.emptyHistory}</p> : <ol className={styles.messageList}>{items.map((message) => <li aria-label={message.deliveryState === 'failed' ? labels.messageFailed : undefined} className={message.role === 'human' ? styles.humanMessage : styles.assistantMessage} key={message.id}><p>{message.body}</p>{message.deliveryState === 'failed' ? <span className={styles.failedMarker}>{labels.messageFailed}</span> : null}</li>)}</ol>}<p aria-live="polite" className={styles.liveStatus}>{items.some((message) => message.deliveryState === 'pending') ? labels.sending : ''}</p></div>
    <ChatComposer conversationId={history.conversation.id} key={history.conversation.id} labels={labels} locale={locale} messages={items} onMessages={setItems} sendEnabled={history.conversation.sendEnabled}/>
  </section>
}
