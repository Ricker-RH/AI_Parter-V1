'use client'

import type {ChannelPage} from '@aifans/contracts'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useEffect, useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {ChannelsApiResult} from '../../lib/channels-api'
import styles from './ChannelPage.module.css'
import {ChannelState} from './ChannelState'

export type ChannelDirectoryLabels = {
  searchLabel: string
  searchPlaceholder: string
  ipCount: string
  emptyTitle: string
  emptyDescription: string
  noResultsTitle: string
  noResultsDescription: string
  clearSearch: string
  unavailableTitle: string
  unavailableDescription: string
  retry: string
  retrying: string
  loadMore?: string
}

function countLabel(template: string, count: number) {
  return template.replace('{count}', String(count))
}

export function ChannelDirectory({labels, locale, query, result}: {labels: ChannelDirectoryLabels; locale: Locale; query: string; result: ChannelsApiResult<ChannelPage>}) {
  const router = useRouter()
  const [draft, setDraft] = useState(query)

  useEffect(() => setDraft(query), [query])
  useEffect(() => {
    if (draft === query) return
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()
      if (draft.trim()) params.set('q', draft.trim())
      router.replace(`/${locale}/channels${params.size ? `?${params}` : ''}`)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [draft, locale, query, router])

  const clear = () => {setDraft(''); router.replace(`/${locale}/channels`)}
  return <div className={styles.directoryBody}>
    <label className={styles.search}>
      <span className={styles.srOnly}>{labels.searchLabel}</span>
      <input aria-label={labels.searchLabel} onChange={(event) => setDraft(event.target.value)} placeholder={labels.searchPlaceholder} type="search" value={draft} />
    </label>
    {result.status !== 'ok'
      ? <ChannelState description={labels.unavailableDescription} retry={labels.retry} title={labels.unavailableTitle} />
      : result.data.items.length === 0
        ? <div className={styles.state}>
          <ChannelState description={query ? labels.noResultsDescription : labels.emptyDescription} title={query ? labels.noResultsTitle : labels.emptyTitle} />
          {query ? <button onClick={clear} type="button">{labels.clearSearch}</button> : null}
        </div>
        : <>
          <div className={styles.directoryGrid}>{result.data.items.map((channel) => <Link aria-label={channel.name} className={styles.channelRow} href={`/${locale}/channels/${channel.slug}`} key={channel.id}>
            <span aria-hidden="true" className={styles.channelImage}>{channel.imageUrl ? <img alt="" src={channel.imageUrl} /> : channel.name.slice(0, 1)}</span>
            <span className={styles.channelCopy}><strong>{channel.name}</strong><span>{channel.description}</span><small>{countLabel(labels.ipCount, channel.ipCount)}</small></span>
            <span aria-hidden="true" className={styles.chevron}>›</span>
          </Link>)}</div>
          {result.data.nextCursor ? <Link className={styles.loadMore} href={`/${locale}/channels?${new URLSearchParams({...query ? {q: query} : {}, cursor: result.data.nextCursor})}`}>{labels.loadMore ?? 'Load more'}</Link> : null}
        </>}
  </div>
}
