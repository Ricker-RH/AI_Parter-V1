import Link from 'next/link'
import {notFound} from 'next/navigation'
import {ChannelIpList} from '../../../../../components/channels/ChannelIpList'
import styles from '../../../../../components/channels/ChannelPage.module.css'
import {ChannelState} from '../../../../../components/channels/ChannelState'
import {getMessages, isLocale} from '../../../../../i18n/config'
import {fetchChannel, fetchChannelIps} from '../../../../../lib/channels-api'

export const instant = true

function format(template: string, name: string) { return template.replace('{name}', name) }

export default async function ChannelProfilesPage({params, searchParams}: {params: Promise<{locale: string; slug: string}>; searchParams: Promise<{cursor?: string | string[]}>}) {
  const [{locale, slug}, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const detail = await fetchChannel(slug)
  if (detail.status === 'not-found') notFound()
  if (detail.status !== 'ok') return <main className={styles.page}><div className={styles.detailInner}><ChannelState description={messages.channelPages.unavailableDescription} retry={messages.channelPages.retry} title={messages.channelPages.channelUnavailable}/></div></main>
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const result = await fetchChannelIps(slug, {...cursor ? {cursor} : {}})
  if (result.status === 'not-found') notFound()
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/channels/${slug}/profiles?${new URLSearchParams({cursor: nextCursor})}` : undefined
  return <main className={styles.page}><div className={styles.detailInner}>
    <header className={styles.detailHeader}><Link aria-label={format(messages.channelPages.backToChannel, detail.data.name)} href={`/${locale}/channels/${slug}`}>←</Link><h1>{format(messages.channelPages.profilesTitle, detail.data.name)}</h1><span /></header>
    <ChannelIpList labels={{empty: messages.channelPages.profilesEmpty, unavailable: messages.channelPages.profilesUnavailable, retry: messages.channelPages.retry, retrying: messages.channelPages.retrying, loadMore: messages.channelPages.loadMore}} locale={locale} result={result} {...moreHref ? {moreHref} : {}} />
  </div></main>
}
