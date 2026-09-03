import {EmptyState} from '@aifans/ui'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {ChannelIpRail} from '../../../../components/channels/ChannelIpRail'
import styles from '../../../../components/channels/ChannelPage.module.css'
import {ChannelState} from '../../../../components/channels/ChannelState'
import {PostCard} from '../../../../components/social/PostCard'
import {PostDetailHeader} from '../../../../components/social/PostDetailHeader'
import {SocialSurface} from '../../../../components/social/SocialSurface'
import {getMessages, isLocale} from '../../../../i18n/config'
import {getOptionalPageAccess} from '../../../../lib/auth/access-policy'
import {fetchChannel, fetchChannelPosts} from '../../../../lib/channels-api'

export const instant = false

export default async function ChannelDetailPage({params, searchParams}: {params: Promise<{locale: string; slug: string}>; searchParams: Promise<{cursor?: string | string[]}>}) {
  const [{locale, slug}, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const detail = await fetchChannel(slug)
  if (detail.status === 'not-found') notFound()
  if (detail.status !== 'ok') return <main className={styles.page}><div className={styles.detailInner}><ChannelState description={messages.channelPages.unavailableDescription} retry={messages.channelPages.retry} title={messages.channelPages.channelUnavailable}/></div></main>
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const access = await getOptionalPageAccess()
  const token = access.status === 'authenticated' ? access.token : undefined
  const posts = await fetchChannelPosts(slug, {...cursor ? {cursor} : {}, ...token ? {token} : {}})
  if (posts.status === 'not-found') notFound()
  const nextCursor = posts.status === 'ok' ? posts.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/channels/${slug}?${new URLSearchParams({cursor: nextCursor})}` : undefined
  const referenceTime = Date.now()
  const viewerScope = access.status === 'authenticated' ? access.viewerScope : undefined
  const channelPath = `/${locale}/channels/${slug}`
  const header = <PostDetailHeader actionsLabel={messages.more} canonicalPath={channelPath} fallbackHref={`/${locale}/channels`} labels={{...messages, back: messages.channelPages.backToChannels}} locale={locale} title={detail.data.name} />
  return <SocialSurface header={header} label={detail.data.name}>
    <ChannelIpRail empty={messages.channelPages.noIps} items={detail.data.recommendedIps} labels={{title: messages.channelPages.channelIps, viewAll: messages.channelPages.viewAll}} locale={locale} profilesHref={`${channelPath}/profiles`} />
    {posts.status !== 'ok'
      ? <ChannelState description={messages.channelPages.unavailableDescription} retry={messages.channelPages.retry} title={messages.channelPages.unavailableTitle} />
      : posts.data.items.length === 0
        ? <div className={styles.state}><EmptyState description="" title={messages.channelPages.noPosts} /></div>
        : <div className={styles.feedList}>{posts.data.items.map((post) => <PostCard canMutate={access.status === 'authenticated'} key={post.id} labels={messages} locale={locale} post={post} referenceTime={referenceTime} returnTo={channelPath} {...viewerScope ? {viewerScope} : {}} />)}{moreHref ? <Link className={styles.loadMore} href={moreHref}>{messages.channelPages.loadMore}</Link> : null}</div>}
  </SocialSurface>
}
