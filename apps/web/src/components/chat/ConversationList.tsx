import type {ChatConversationSummary} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import styles from './MessagesWorkspace.module.css'

export type ConversationListLabels = {title: string; noConversations: string; loadMore: string; emptyHistory?: string; unavailable?: string}

function stamp(value: string, locale: Locale) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'}).format(date)
}

export function ConversationList({items, labels, locale, selectedId, moreHref, unavailable = false}: {items: ChatConversationSummary[]; labels: ConversationListLabels; locale: Locale; selectedId?: string | undefined; moreHref?: string | undefined; unavailable?: boolean | undefined}) {
  return <aside aria-label={labels.title} className={styles.listPane}>
    <header className={styles.listHeader}><h1>{labels.title}</h1></header>
    {unavailable ? <p className={styles.listNotice} role="alert">{labels.unavailable}</p> : null}
    {!unavailable && items.length === 0 ? <p className={styles.listNotice}>{labels.noConversations}</p> : null}
    <nav className={styles.conversationList}>{items.map((conversation) => {
      const href = `/${locale}/messages/${conversation.id}`
      const last = conversation.lastMessage
      return <Link aria-current={conversation.id === selectedId ? 'page' : undefined} className={styles.conversationRow} href={href} key={conversation.id}>
        <span aria-hidden="true" className={styles.avatar}>{conversation.ipProfile.displayName.slice(0, 1).toUpperCase()}</span>
        <span className={styles.conversationCopy}><span className={styles.conversationTitle}><strong>{conversation.ipProfile.displayName}</strong><time dateTime={conversation.updatedAt}>{stamp(conversation.updatedAt, locale)}</time></span><span className={styles.username}>@{conversation.ipProfile.username}</span><span className={styles.preview}>{last?.body ?? labels.emptyHistory ?? ''}</span></span>
      </Link>
    })}</nav>
    {moreHref ? <Link className={styles.more} href={moreHref}>{labels.loadMore}</Link> : null}
  </aside>
}
