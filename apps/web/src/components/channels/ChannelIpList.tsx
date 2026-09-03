import type {ChannelIpPage} from '@aifans/contracts'
import {EmptyState} from '@aifans/ui'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {ChannelsApiResult} from '../../lib/channels-api'
import styles from './ChannelPage.module.css'
import {ChannelState} from './ChannelState'

type Labels = {empty: string; unavailable: string; retry: string; retrying: string; loadMore: string}

export function ChannelIpList({labels, locale, moreHref, result}: {labels: Labels; locale: Locale; moreHref?: string; result: ChannelsApiResult<ChannelIpPage>}) {
  if (result.status !== 'ok') return <ChannelState retry={labels.retry} title={labels.unavailable} />
  if (!result.data.items.length) return <div className={styles.state}><EmptyState description="" title={labels.empty} /></div>
  return <div className={styles.ipList}>{result.data.items.map((ip) => <Link aria-label={ip.displayName} className={styles.ipRow} href={`/${locale}/profiles/${ip.id}`} key={ip.id}>
    <span aria-hidden="true" className={styles.ipAvatar}>{ip.displayName.slice(0, 1)}</span>
    <span><strong>{ip.displayName}</strong><small>@{ip.username}</small>{ip.bio ? <p>{ip.bio}</p> : null}</span>
  </Link>)}{result.data.nextCursor && moreHref ? <Link className={styles.loadMore} href={moreHref}>{labels.loadMore}</Link> : null}</div>
}
