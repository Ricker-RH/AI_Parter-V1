import type {ChatConversationSummary, ChatHistoryPage} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import {ConversationDetail, type ConversationDetailLabels} from './ConversationDetail'
import {ConversationList, type ConversationListLabels} from './ConversationList'
import {MessagesSectionHeader} from './MessagesSectionHeader'
import styles from './MessagesWorkspace.module.css'

export type MessagesLabels = ConversationListLabels & ConversationDetailLabels & {selectConversation: string}

export function MessagesWorkspace({items, labels, locale, selectedId, history, initialCursor, nextCursor, listUnavailable = false, detailUnavailable = false}: {items: ChatConversationSummary[]; labels: MessagesLabels; locale: Locale; selectedId?: string | undefined; history?: ChatHistoryPage | undefined; initialCursor?: string | undefined; nextCursor?: string | null | undefined; listUnavailable?: boolean | undefined; detailUnavailable?: boolean | undefined}) {
  const mobileHeader = <div className={styles.mobileDetailSectionHeader}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/></div>
  return <main className={styles.workspace} data-list-unavailable={listUnavailable || undefined} data-selected={selectedId ? 'true' : undefined}><ConversationList initialCursor={initialCursor} items={items} labels={labels} locale={locale} nextCursor={nextCursor} selectedId={selectedId} unavailable={listUnavailable}/>{selectedId ? <ConversationDetail history={history} labels={labels} listCursor={initialCursor} locale={locale} sectionHeader={mobileHeader} unavailable={detailUnavailable}/> : listUnavailable ? null : <section className={styles.emptyPane}><div><h2>{labels.selectConversation}</h2></div></section>}</main>
}
