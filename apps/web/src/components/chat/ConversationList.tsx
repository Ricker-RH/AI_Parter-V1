'use client'

import type {ChatConversationSummary} from '@aifans/contracts'
import Link from 'next/link'
import {useDeferredValue, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {MessagesSectionHeader, type MessagesSectionLabels} from './MessagesSectionHeader'
import {UnavailableRetry} from '../social/UnavailableRetry'
import styles from './MessagesWorkspace.module.css'

export type ConversationListLabels = MessagesSectionLabels & {noConversations: string; emptyDescription: string; emptyAction: string; searchLabel: string; searchPlaceholder: string; noSearchResults: string; loadMore: string; emptyHistory?: string; unavailable?: string; unavailableDescription: string; unavailableAction: string; unavailablePending: string}

function stamp(value: string, locale: Locale) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'}).format(date)
}

export function ConversationList({items, labels, locale, selectedId, moreHref, unavailable = false}: {items: ChatConversationSummary[]; labels: ConversationListLabels; locale: Locale; selectedId?: string | undefined; moreHref?: string | undefined; unavailable?: boolean | undefined}) {
  const [query, setQuery] = useState('')
  const normalizedQuery = useDeferredValue(query).trim().toLocaleLowerCase(locale)
  const visibleItems = normalizedQuery ? items.filter((conversation) => [conversation.ipProfile.displayName, conversation.ipProfile.username, conversation.lastMessage?.body ?? ''].some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))) : items
  return <aside aria-label={labels.title} className={styles.listPane}>
    <MessagesSectionHeader active="chat" labels={labels} locale={locale}>{!unavailable ? <label className={styles.searchField}><span className="sr-only">{labels.searchLabel}</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input aria-label={labels.searchLabel} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={labels.searchPlaceholder} type="search" value={query}/></label> : null}</MessagesSectionHeader>
    {unavailable ? <div className={styles.unavailableState} role="alert"><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M24 7v20"/><path d="M24 36.5v.5"/><circle cx="24" cy="24" r="18"/></svg><h2>{labels.unavailable}</h2><p>{labels.unavailableDescription}</p><UnavailableRetry label={labels.unavailableAction} pendingLabel={labels.unavailablePending}/></div> : <>
    {items.length === 0 ? <div className={styles.inboxEmpty}><svg aria-hidden="true" viewBox="0 0 48 48"><path d="M10 27.5 38 10 27 38l-5.5-10.5L10 27.5Z"/><path d="m21.5 27.5 8-8"/></svg><h2>{labels.noConversations}</h2><p>{labels.emptyDescription}</p><Link href={`/${locale}`}>{labels.emptyAction}</Link></div> : null}
    {items.length > 0 && visibleItems.length === 0 ? <p className={styles.searchEmpty} role="status">{labels.noSearchResults}</p> : null}
    <nav className={styles.conversationList}>{visibleItems.map((conversation) => {
      const href = `/${locale}/messages/${conversation.id}`
      const last = conversation.lastMessage
      return <Link aria-current={conversation.id === selectedId ? 'page' : undefined} className={styles.conversationRow} href={href} key={conversation.id}>
        <span aria-hidden="true" className={styles.avatar}>{conversation.ipProfile.displayName.slice(0, 1).toUpperCase()}</span>
        <span className={styles.conversationCopy}><span className={styles.conversationTitle}><strong>{conversation.ipProfile.displayName}</strong><time dateTime={conversation.updatedAt}>{stamp(conversation.updatedAt, locale)}</time></span><span className={styles.username}>@{conversation.ipProfile.username}</span><span className={styles.preview}>{last?.body ?? labels.emptyHistory ?? ''}</span></span>
      </Link>
    })}</nav>
    {moreHref ? <Link className={styles.more} href={moreHref}>{labels.loadMore}</Link> : null}</>}
  </aside>
}
