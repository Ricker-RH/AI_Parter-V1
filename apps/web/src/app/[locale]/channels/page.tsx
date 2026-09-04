import {notFound} from 'next/navigation'
import {CachedChannelDirectory} from '../../../components/channels/CachedChannelDirectory'
import styles from '../../../components/channels/ChannelPage.module.css'
import {SocialSurface} from '../../../components/social/SocialSurface'
import {getMessages, isLocale} from '../../../i18n/config'

export const instant = true

export default async function ChannelDirectoryPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{q?: string | string[]; cursor?: string | string[]}>}) {
  const [{locale}, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const q = typeof query.q === 'string' ? query.q : undefined
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const messages = await getMessages(locale)
  const header = <header className={`page-header ${styles.directoryHeader}`}><h1 className="page-title">{messages.channels}</h1></header>
  return <SocialSurface header={header} label={messages.channels}>
    <CachedChannelDirectory {...(cursor ? {cursor} : {})} labels={{...messages.channelPages, loadMore: messages.channelPages.loadMore}} locale={locale} query={q ?? ''} />
  </SocialSurface>
}
