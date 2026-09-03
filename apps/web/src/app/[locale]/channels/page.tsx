import {notFound} from 'next/navigation'
import {ChannelDirectory} from '../../../components/channels/ChannelDirectory'
import styles from '../../../components/channels/ChannelPage.module.css'
import {getMessages, isLocale} from '../../../i18n/config'
import {fetchChannels} from '../../../lib/channels-api'

export const instant = true

export default async function ChannelDirectoryPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{q?: string | string[]; cursor?: string | string[]}>}) {
  const [{locale}, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const q = typeof query.q === 'string' ? query.q : undefined
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const result = await fetchChannels({...q ? {q} : {}, ...cursor ? {cursor} : {}})
  const messages = await getMessages(locale)
  return <main className={styles.page}>
    <div className={styles.pageInner}>
      <header className={styles.directoryHeader}><h1>{messages.channels}</h1><p>{messages.channelPages.description}</p></header>
      <ChannelDirectory labels={{...messages.channelPages, loadMore: messages.channelPages.loadMore}} locale={locale} query={q ?? ''} result={result} />
    </div>
  </main>
}
