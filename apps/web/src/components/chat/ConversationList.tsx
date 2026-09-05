'use client'

import {ChatConversationPageSchema, type ChatConversationSummary, type HumanInboxPage} from '@aifans/contracts'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {QueryClientContext} from '@tanstack/react-query'
import {ConversationRowActions, conversationTime} from './ConversationRowActions'
import actionStyles from './ConversationRowActions.module.css'
import {useContext, useDeferredValue, useEffect, useRef, useState, type ReactNode} from 'react'
import {Avatar} from '../account/Avatar'
import {HumanAvatar} from '../account/HumanAvatar'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {MessagesSectionHeader, type MessagesSectionLabels} from './MessagesSectionHeader'
import {SectionSearchField} from '../SectionSearchField'
import {UnavailableRetry} from '../social/UnavailableRetry'
import styles from './MessagesWorkspace.module.css'

export type ConversationListLabels = MessagesSectionLabels & {noConversations: string; emptyDescription: string; emptyAction: string; searchLabel: string; searchPlaceholder: string; noSearchResults: string; partialSearchResults: string; loadMore: string; loadingMore: string; loadMoreError: string; emptyHistory?: string; unavailable?: string; unavailableDescription: string; unavailableAction: string; unavailablePending: string}

type ConversationEntry = {conversation: ChatConversationSummary; listCursor?: string | undefined}
function initialEntries(items: ChatConversationSummary[], initialCursor?: string) { return items.filter((conversation) => conversation.lastMessage !== null).map((conversation) => ({conversation, ...(initialCursor ? {listCursor: initialCursor} : {})})) }
function appendUnique(current: ConversationEntry[], incoming: ConversationEntry[]) { const seen = new Set(current.map(({conversation}) => conversation.id)); return [...current, ...incoming.filter(({conversation}) => { if (seen.has(conversation.id)) return false; seen.add(conversation.id); return true })] }

export function ConversationList({items, labels, locale, selectedId, initialCursor, nextCursor: initialNextCursor, unavailable = false, humanItems = [], selfProfileId, selectedHumanId, humanFooter, humanLoading = false}: {items: ChatConversationSummary[]; labels: ConversationListLabels; locale: Locale; selectedId?: string | undefined; initialCursor?: string | undefined; nextCursor?: string | null | undefined; unavailable?: boolean | undefined; humanItems?: HumanInboxPage['items']; selfProfileId?: string; selectedHumanId?: string | undefined; humanFooter?: ReactNode; humanLoading?: boolean}) {
  const router = useRouter()
  const queryClient = useContext(QueryClientContext)
  const preferenceRevision = useRef(0)
  const [preferences, setPreferences] = useState<Record<string, {pinnedAt: string | null; deletedAt: string | null}>>({})
  useEffect(() => {
    const request = new AbortController()
    const revision = preferenceRevision.current
    void fetch('/api/inbox/preferences', {signal: request.signal}).then(async response => {
      if (!response.ok) return
      const value = await response.json()
      if (!request.signal.aborted && revision === preferenceRevision.current && Array.isArray(value.items)) setPreferences(Object.fromEntries(value.items.filter((item: {kind?: string; conversationId?: string}) => item.kind && item.conversationId).map((item: {kind: string; conversationId: string; pinnedAt: string | null; deletedAt: string | null}) => [`${item.kind}:${item.conversationId}`, item])))
    }).catch(() => {})
    return () => request.abort()
  }, [])
  async function updatePreference(kind: 'IP' | 'HUMAN', id: string, selected: boolean, action: 'pin' | 'unpin' | 'delete') {
    const response = await fetch('/api/inbox/preferences', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({kind, conversationId: id, action})})
    if (!response.ok) throw Error('unavailable')
    const changedAt = new Date().toISOString()
    preferenceRevision.current += 1
    setPreferences(current => ({...current, [`${kind}:${id}`]: {pinnedAt: action === 'pin' ? changedAt : null, deletedAt: action === 'delete' ? changedAt : current[`${kind}:${id}`]?.deletedAt ?? null}}))
    if (action === 'delete') {
      window.dispatchEvent(new CustomEvent('aifans:conversation-deleted', {detail: {kind, conversationId: id, deletedAt: changedAt}}))
      await queryClient?.cancelQueries({predicate: query => query.queryKey.includes(id)})
      queryClient?.removeQueries({predicate: query => query.queryKey.includes(id)})
      void queryClient?.invalidateQueries()
      if (selected) router.replace(`/${locale}/messages`)
      router.refresh()
    }
  }
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<ConversationEntry[]>(() => initialEntries(items, initialCursor))
  const [nextCursor, setNextCursor] = useState(initialNextCursor ?? null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const loadingRef = useRef(false)
  const mounted = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const normalizedQuery = useDeferredValue(query).trim().toLocaleLowerCase(locale)
  const rows = [
    ...entries.map(({conversation, listCursor}) => ({kind: 'IP' as const, id: conversation.id, person: conversation.ipProfile, body: conversation.lastMessage?.body ?? '', updatedAt: conversation.lastMessage?.createdAt ?? conversation.updatedAt, unread: conversation.unreadCount ?? 0, selected: conversation.id === selectedId, href: `/${locale}/messages/${conversation.id}${listCursor ? `?${new URLSearchParams({listCursor})}` : ''}`})),
    ...humanItems.flatMap(({conversation, latestMessage, unreadCount}) => {
      if (!conversation.participants.some(person => person.id === selfProfileId)) return []
      const person = conversation.participants.find(person => person.id !== selfProfileId)!
      return [{kind: 'HUMAN' as const, id: conversation.id, person, body: latestMessage?.content.kind === 'text' ? latestMessage.content.text : latestMessage?.content.kind==='image'?(locale==='zh-CN'?'图片':'Image'):latestMessage?.content.kind==='voice'?(locale==='zh-CN'?'语音':'Voice message'):latestMessage?.content.kind==='sticker'?(locale==='zh-CN'?'贴纸':'Sticker'):latestMessage?.content.kind==='share'?(locale==='zh-CN'?'分享内容':'Shared content'):'', updatedAt: latestMessage?.createdAt ?? conversation.updatedAt, unread: unreadCount, selected: conversation.id === selectedHumanId, href: `/${locale}/messages?humanConversation=${conversation.id}`}]
    }),
  ].filter(row => {const deleted = preferences[`${row.kind}:${row.id}`]?.deletedAt; return !deleted || row.updatedAt > deleted}).sort((a, b) => {const ap = preferences[`${a.kind}:${a.id}`]?.pinnedAt; const bp = preferences[`${b.kind}:${b.id}`]?.pinnedAt; return Number(Boolean(bp)) - Number(Boolean(ap)) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)})
  const visibleRows = normalizedQuery ? rows.filter(row => [row.person.displayName, row.person.username, row.body].some(value => value.toLocaleLowerCase(locale).includes(normalizedQuery))) : rows
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
    <MessagesSectionHeader active="chat" labels={labels} locale={locale}>{!unavailable ? <SectionSearchField label={labels.searchLabel} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={labels.searchPlaceholder} value={query}/> : null}</MessagesSectionHeader>
    {unavailable ? <div className={styles.unavailableState} role="alert"><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M24 7v20"/><path d="M24 36.5v.5"/><circle cx="24" cy="24" r="18"/></svg><h2>{labels.unavailable}</h2><p>{labels.unavailableDescription}</p><UnavailableRetry label={labels.unavailableAction} pendingLabel={labels.unavailablePending}/></div> : <>
    {rows.length === 0 && !nextCursor && !humanLoading ? <div className={styles.inboxEmpty}><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M10 27.5 38 10 27 38l-5.5-10.5L10 27.5Z"/><path d="m21.5 27.5 8-8"/></svg><h2>{labels.noConversations}</h2><p>{selfProfileId ? locale==='zh-CN' ? '与真人和 AI/IP 的对话都会显示在这里。' : 'Conversations with people and AI/IP profiles appear here.' : labels.emptyDescription}</p><Link href={`/${locale}`}>{labels.emptyAction}</Link></div> : null}
    {rows.length > 0 && visibleRows.length === 0 ? <p className={styles.searchEmpty} role="status">{nextCursor ? labels.partialSearchResults : labels.noSearchResults}</p> : null}
    <nav className={styles.conversationList}>{visibleRows.map(row => {
      const profileHref = `/${locale}/${row.kind === 'HUMAN' ? 'humans' : 'profiles'}/${row.person.id}`
      const profileLabel = locale === 'zh-CN' ? '查看主页' : 'View profile'
      const conversationLabel = locale === 'zh-CN' ? `打开与 ${row.person.displayName} 的对话` : `Open conversation: ${row.person.displayName}`
      return <ConversationRowActions key={`${row.kind}:${row.id}`} locale={locale} pinned={Boolean(preferences[`${row.kind}:${row.id}`]?.pinnedAt)} onAction={action => updatePreference(row.kind, row.id, row.selected, action)}><div className={styles.conversationRow} data-pinned={Boolean(preferences[`${row.kind}:${row.id}`]?.pinnedAt) || undefined} data-selected={row.selected || undefined} key={`${row.kind}:${row.id}`}>
        <Link aria-label={profileLabel} className={styles.conversationAvatar} href={profileHref}>
          {row.kind === 'HUMAN' ? <HumanAvatar className={styles.listAvatar!} decorative human={row.person} size="medium"/> : <Avatar avatarUrl={null} className={styles.listAvatar!} decorative displayName={row.person.displayName} identityId={row.person.id} kind="ip" size="medium"/>}
        </Link>
        <Link aria-current={row.selected ? 'page' : undefined} aria-label={conversationLabel} className={styles.conversationCopy} href={row.href}><span className={styles.conversationTitle}><strong>{row.person.displayName}</strong><span className={actionStyles.metadata}>{preferences[`${row.kind}:${row.id}`]?.pinnedAt ? <span className={actionStyles.visuallyHidden} aria-label={locale === 'zh-CN' ? '已置顶' : 'Pinned'}/> : null}<time className={actionStyles.time} dateTime={row.updatedAt} title={new Date(row.updatedAt).toLocaleString(locale)}>{conversationTime(row.updatedAt, locale)}</time>{row.unread > 0 ? <span aria-label={locale==='zh-CN' ? `${row.unread} 条未读消息` : `${row.unread} unread messages`} className={styles.unreadBadge}>{row.unread > 99 ? '99+' : row.unread}</span> : null}</span></span><span className={styles.preview}>{row.body}</span></Link>
      </div></ConversationRowActions>
    })}</nav>
    {loadMoreError ? <p className={styles.paginationError} role="alert">{labels.loadMoreError}</p> : null}
    {nextCursor ? <button className={styles.more} disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? labels.loadingMore : labels.loadMore}</button> : null}</>}
    {humanFooter}
  </aside>
}
