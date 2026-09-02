'use client'

import {ChatConversationPageSchema, type ChatConversationSummary} from '@aifans/contracts'
import Link from 'next/link'
import {useDeferredValue, useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {MessagesSectionHeader, type MessagesSectionLabels} from './MessagesSectionHeader'
import {UnavailableRetry} from '../social/UnavailableRetry'
import styles from './MessagesWorkspace.module.css'

export type ConversationListLabels = MessagesSectionLabels & {noConversations: string; emptyDescription: string; emptyAction: string; searchLabel: string; searchPlaceholder: string; noSearchResults: string; partialSearchResults: string; loadMore: string; loadingMore: string; loadMoreError: string; emptyHistory?: string; unavailable?: string; unavailableDescription: string; unavailableAction: string; unavailablePending: string}

export function formatConversationStamp(value: string, locale: Locale) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', timeZone: 'UTC'}).format(date)
}

type ConversationEntry = {conversation: ChatConversationSummary; listCursor?: string | undefined}
function initialEntries(items: ChatConversationSummary[], initialCursor?: string) { return items.map((conversation) => ({conversation, ...(initialCursor ? {listCursor: initialCursor} : {})})) }
function appendUnique(current: ConversationEntry[], incoming: ConversationEntry[]) { const seen = new Set(current.map(({conversation}) => conversation.id)); return [...current, ...incoming.filter(({conversation}) => { if (seen.has(conversation.id)) return false; seen.add(conversation.id); return true })] }

export function ConversationList({items, labels, locale, selectedId, initialCursor, nextCursor: initialNextCursor, unavailable = false}: {items: ChatConversationSummary[]; labels: ConversationListLabels; locale: Locale; selectedId?: string | undefined; initialCursor?: string | undefined; nextCursor?: string | null | undefined; unavailable?: boolean | undefined}) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<ConversationEntry[]>(() => initialEntries(items, initialCursor))
  const [nextCursor, setNextCursor] = useState(initialNextCursor ?? null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const loadingRef = useRef(false)
  const mounted = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const normalizedQuery = useDeferredValue(query).trim().toLocaleLowerCase(locale)
  const visibleEntries = normalizedQuery ? entries.filter(({conversation}) => [conversation.ipProfile.displayName, conversation.ipProfile.username, conversation.lastMessage?.body ?? ''].some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))) : entries
  useEffect(() => {
    controller.current?.abort(); controller.current = null; loadingRef.current = false; setLoadingMore(false)
    setEntries(initialEntries(items, initialCursor)); setNextCursor(initialNextCursor ?? null); setLoadMoreError(false)
  }, [items, initialCursor, initialNextCursor])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  async function cancelBody(response: Response) { try { await response.body?.cancel() } catch {} }
  async function loadMore() {
    const cursor = nextCursor
    if (!cursor || loadingRef.current) return
    loadingRef.current = true; setLoadingMore(true); setLoadMoreError(false)
    const request = new AbortController(); controller.current = request
    const current = () => mounted.current && controller.current === request && !request.signal.aborted
    try {
      const response = await fetch(`/api/conversations?${new URLSearchParams({cursor})}`, {method: 'GET', signal: request.signal})
      if (!current()) { await cancelBody(response); return }
      if (response.status === 401) {
        await cancelBody(response)
        if (!current()) return
        const returnTo = selectedId
          ? `/${locale}/messages/${selectedId}${initialCursor ? `?${new URLSearchParams({listCursor: initialCursor})}` : ''}`
          : `/${locale}/messages${initialCursor ? `?${new URLSearchParams({cursor: initialCursor})}` : ''}`
        globalThis.location.assign(authHref(locale, returnTo))
        return
      }
      if (!response.ok) { await cancelBody(response); throw Error('unavailable') }
      const value: unknown = await response.json()
      const parsed = ChatConversationPageSchema.safeParse(value)
      if (!current()) return
      if (!parsed.success) throw Error('unavailable')
      setEntries((current) => appendUnique(current, initialEntries(parsed.data.items, cursor)))
      setNextCursor(parsed.data.nextCursor)
    } catch (error) {
      if (current() && (error as Error).name !== 'AbortError') setLoadMoreError(true)
    } finally {
      if (controller.current !== request) return
      controller.current = null
      loadingRef.current = false
      if (mounted.current) setLoadingMore(false)
    }
  }
  return <aside aria-label={labels.title} className={styles.listPane}>
    <MessagesSectionHeader active="chat" labels={labels} locale={locale}>{!unavailable ? <label className={styles.searchField}><span className="sr-only">{labels.searchLabel}</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input aria-label={labels.searchLabel} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={labels.searchPlaceholder} type="search" value={query}/></label> : null}</MessagesSectionHeader>
    {unavailable ? <div className={styles.unavailableState} role="alert"><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M24 7v20"/><path d="M24 36.5v.5"/><circle cx="24" cy="24" r="18"/></svg><h2>{labels.unavailable}</h2><p>{labels.unavailableDescription}</p><UnavailableRetry label={labels.unavailableAction} pendingLabel={labels.unavailablePending}/></div> : <>
    {entries.length === 0 && !nextCursor ? <div className={styles.inboxEmpty}><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M10 27.5 38 10 27 38l-5.5-10.5L10 27.5Z"/><path d="m21.5 27.5 8-8"/></svg><h2>{labels.noConversations}</h2><p>{labels.emptyDescription}</p><Link href={`/${locale}`}>{labels.emptyAction}</Link></div> : null}
    {entries.length > 0 && visibleEntries.length === 0 ? <p className={styles.searchEmpty} role="status">{nextCursor ? labels.partialSearchResults : labels.noSearchResults}</p> : null}
    <nav className={styles.conversationList}>{visibleEntries.map(({conversation, listCursor}) => {
      const href = `/${locale}/messages/${conversation.id}${listCursor ? `?${new URLSearchParams({listCursor})}` : ''}`
      const last = conversation.lastMessage
      return <Link aria-current={conversation.id === selectedId ? 'page' : undefined} className={styles.conversationRow} href={href} key={conversation.id}>
        <span aria-hidden="true" className={styles.avatar}>{conversation.ipProfile.displayName.slice(0, 1).toUpperCase()}</span>
        <span className={styles.conversationCopy}><span className={styles.conversationTitle}><strong>{conversation.ipProfile.displayName}</strong><time dateTime={conversation.updatedAt}>{formatConversationStamp(conversation.updatedAt, locale)}</time></span><span className={styles.username}>@{conversation.ipProfile.username}</span><span className={styles.preview}>{last?.body ?? labels.emptyHistory ?? ''}</span></span>
      </Link>
    })}</nav>
    {loadMoreError ? <p className={styles.paginationError} role="alert">{labels.loadMoreError}</p> : null}
    {nextCursor ? <button className={styles.more} disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? labels.loadingMore : labels.loadMore}</button> : null}</>}
  </aside>
}
