'use client'

import {useRouter, useSearchParams} from 'next/navigation'
import {useEffect, useRef} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import {SocialSurface} from './SocialSurface'
import {CachedHomeFeed} from './CachedHomeFeed'
import {FeedTabs} from './FeedTabs'
import type {SocialLabels} from './types'

type Props = {labels: SocialLabels & {forYou: string; following: string; home: string}; locale: Locale}

function LoadingFeed({label}: {label: string}) {
  return <div aria-busy="true" aria-label={label} className="route-skeleton route-skeleton--feed" data-home-feed-fallback role="status"><div aria-hidden="true" className="route-skeleton-content">{Array.from({length: 3}, (_, index) => <div className="route-skeleton-card" key={index}><span className="route-skeleton-avatar"/><span className="route-skeleton-card-content"><span className="route-skeleton-line route-skeleton-line--short"/><span className="route-skeleton-line"/><span className="route-skeleton-line route-skeleton-line--medium"/></span></div>)}</div></div>
}

export function CachedHomeRoute({labels, locale}: Props) {
  const params = useSearchParams()
  const router = useRouter()
  const {account, status} = useCurrentAccount()
  const redirected = useRef(false)
  const following = params.get('feed') === 'following'
  const cursor = params.get('cursor') ?? undefined
  const scope = account ? `${account.kind}:${account.id}` : 'public'
  const returnTo = `/${locale}${following ? '?feed=following' : ''}`
  useEffect(() => {
    if (!following || status !== 'anonymous' || redirected.current) return
    redirected.current = true
    router.replace(authHref(locale, returnTo))
  }, [following, locale, returnTo, router, status])

  const header = <header className="page-header home-header"><h1 className="page-title home-title">{following ? labels.following : labels.forYou}</h1><FeedTabs currentQuery={params.toString()} following={following} labels={labels} locale={locale}/></header>
  if (following && (status === 'loading' || status === 'anonymous')) return <SocialSurface className="home-page" header={header} label={labels.posts}><LoadingFeed label={labels.posts}/></SocialSurface>
  if (following && status === 'unavailable') return <SocialSurface className="home-page" header={header} label={labels.posts}><CachedHomeFeed canMutate={false} initialResult={{status: 'unavailable'}} kind="following" labels={labels} locale={locale} returnTo={returnTo}/></SocialSurface>

  return <SocialSurface className="home-page" header={header} label={labels.posts}><CachedHomeFeed canMutate={Boolean(account)} {...(cursor ? {cursor} : {})} kind={following ? 'following' : 'for_you'} labels={labels} locale={locale} returnTo={returnTo} {...(account ? {viewerScope: scope} : {})}/></SocialSurface>
}
