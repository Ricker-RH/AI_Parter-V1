import {notFound} from 'next/navigation'
import {ChannelDirectory} from '../../../components/channels/ChannelDirectory'
import styles from '../../../components/channels/ChannelPage.module.css'
import {SocialSurface} from '../../../components/social/SocialSurface'
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
  const header = <header className={`page-header ${styles.directoryHeader}`}><h1 className="page-title">{messages.channels}</h1></header>
  return <SocialSurface header={header} label={messages.channels}>
    <ChannelDirectory labels={{...messages.channelPages, loadMore: messages.channelPages.loadMore}} locale={locale} query={q ?? ''} result={result} />
  </SocialSurface>
}
