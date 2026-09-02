import type {ChatConversationSummary, ChatHistoryPage} from '@aifans/contracts'
import type {Locale} from '../../i18n/config'
import {ConversationDetail, type ConversationDetailLabels} from './ConversationDetail'
import {ConversationList, type ConversationListLabels} from './ConversationList'
import styles from './MessagesWorkspace.module.css'

export type MessagesLabels = ConversationListLabels & ConversationDetailLabels & {selectConversation: string}

export function MessagesWorkspace({items, labels, locale, selectedId, history, moreHref, listUnavailable = false, detailUnavailable = false}: {items: ChatConversationSummary[]; labels: MessagesLabels; locale: Locale; selectedId?: string | undefined; history?: ChatHistoryPage | undefined; moreHref?: string | undefined; listUnavailable?: boolean | undefined; detailUnavailable?: boolean | undefined}) {
  return <main className={styles.workspace} data-list-unavailable={listUnavailable || undefined} data-selected={selectedId ? 'true' : undefined}><ConversationList items={items} labels={labels} locale={locale} moreHref={moreHref} selectedId={selectedId} unavailable={listUnavailable}/>{selectedId ? <ConversationDetail history={history} labels={labels} locale={locale} unavailable={detailUnavailable}/> : listUnavailable ? null : <section className={styles.emptyPane}><div><h2>{labels.selectConversation}</h2></div></section>}</main>
}
