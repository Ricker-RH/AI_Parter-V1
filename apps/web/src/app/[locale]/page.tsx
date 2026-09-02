import {Suspense} from 'react'
import {getMessages, isLocale} from '../../i18n/config'
import {notFound} from 'next/navigation'
import {locale as rootLocale} from 'next/root-params'
import {FeedContent} from '../../components/social/FeedContent'
import {FeedTabs} from '../../components/social/FeedTabs'
import {fetchFeed} from '../../lib/social-api'
import {getOptionalPageAccess, redirectToUserSignIn, requireAuthenticatedPage} from '../../lib/auth/access-policy'
import {SocialSurface} from '../../components/social/SocialSurface'

export const instant = true

type HomeSearchParams = Record<string, string | string[] | undefined>

function currentQueryString(values: HomeSearchParams) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') query.append(key, value)
    else if (Array.isArray(value)) for (const item of value) query.append(key, item)
  }
  return query.toString()
}

type Messages = Awaited<ReturnType<typeof getMessages>>
type FeedResult = Awaited<ReturnType<typeof fetchFeed>>

function FeedFallback({label}: {label: string}) {
  return <div aria-busy="true" aria-label={label} className="route-skeleton route-skeleton--feed" data-home-feed-fallback role="status"><div aria-hidden="true" className="route-skeleton-content">{Array.from({length: 3}, (_, index) => <div className="route-skeleton-card" key={index}><span className="route-skeleton-avatar"/><span className="route-skeleton-card-content"><span className="route-skeleton-line route-skeleton-line--short"/><span className="route-skeleton-line"/><span className="route-skeleton-line route-skeleton-line--medium"/></span></div>)}</div></div>
}

function FeedView({canMutate, cursor, following, labels, locale, result, returnTo}: {canMutate: boolean; cursor?: string; following: boolean; labels: Messages; locale: 'en' | 'zh-CN'; result: FeedResult; returnTo: string}) {
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const pageQuery = new URLSearchParams()
  if (following) pageQuery.set('feed', 'following')
  if (nextCursor) pageQuery.set('cursor', nextCursor)
  const moreHref = nextCursor ? `/${locale}?${pageQuery}` : undefined
  return <FeedContent canMutate={canMutate} labels={labels} locale={locale} moreHref={moreHref} result={result} returnTo={returnTo} />
}

async function OptionalForYouFeed({cursor, labels, locale, personalization, publicResult, returnTo}: {cursor?: string; labels: Messages; locale: 'en' | 'zh-CN'; personalization: Promise<{canMutate: boolean; result: FeedResult} | null>; publicResult: FeedResult; returnTo: string}) {
  const personalized = await personalization
  const selected = personalized ?? {canMutate: false, result: publicResult}
  return <FeedView canMutate={selected.canMutate} {...(cursor ? {cursor} : {})} following={false} labels={labels} locale={locale} result={selected.result} returnTo={returnTo}/>
}

export async function PublicForYouFeed({cursor, labels, locale, personalization, publicResult, returnTo}: {cursor?: string; labels: Messages; locale: 'en' | 'zh-CN'; personalization: Promise<{canMutate: boolean; result: FeedResult} | null>; publicResult: Promise<FeedResult>; returnTo: string}) {
  const result = await publicResult
  const publicView = <FeedView canMutate={false} {...(cursor ? {cursor} : {})} following={false} labels={labels} locale={locale} result={result} returnTo={returnTo}/>
  return <Suspense fallback={publicView}><OptionalForYouFeed {...(cursor ? {cursor} : {})} labels={labels} locale={locale} personalization={personalization} publicResult={result} returnTo={returnTo}/></Suspense>
}

async function FollowingFeed({labels, locale, load, returnTo}: {labels: Messages; locale: 'en' | 'zh-CN'; load: Promise<{canMutate: boolean; result: FeedResult}>; returnTo: string}) {
  const loaded = await load
  return <FeedView canMutate={loaded.canMutate} following labels={labels} locale={locale} result={loaded.result} returnTo={returnTo}/>
}

export async function HomeQueryContent({locale: candidate, messages, searchParams}: {locale: 'en' | 'zh-CN'; messages: Messages; searchParams: Promise<HomeSearchParams>}) {
  const query = await searchParams
  const following = query.feed === 'following'
  const feedTitle = following ? messages.following : messages.forYou
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const currentQueryParams = new URLSearchParams(currentQueryString(query))
  currentQueryParams.delete('cursor')
  currentQueryParams.delete('visualType')
  const currentQuery = currentQueryParams.toString()
  const returnTo = following ? `/${candidate}?feed=following` : `/${candidate}`
  const header = <header className="page-header home-header"><h1 className="page-title home-title">{feedTitle}</h1><FeedTabs currentQuery={currentQuery} following={following} labels={messages} locale={candidate}/></header>
  if (following) {
    const load = requireAuthenticatedPage({locale: candidate, returnTo}).then(async (access) => {
      if (access.status === 'unavailable') return {canMutate: false, result: {status: 'unavailable'} as const}
      const result = await fetchFeed({kind: 'following', locale: candidate, ...(cursor ? {cursor} : {}), token: access.token})
      if (result.status === 'auth-required') redirectToUserSignIn({locale: candidate, returnTo})
      return {canMutate: true, result}
    })
    return <SocialSurface className="home-page" header={header} label={messages.posts}><Suspense fallback={<FeedFallback label={messages.posts}/>}><FollowingFeed labels={messages} load={load} locale={candidate} returnTo={returnTo}/></Suspense></SocialSurface>
  }

  const publicResult = fetchFeed({kind: 'for_you', locale: candidate, ...(cursor ? {cursor} : {})})
  const personalization = getOptionalPageAccess().then(async (access) => {
    if (access.status !== 'authenticated') return null
    const result = await fetchFeed({kind: 'for_you', locale: candidate, ...(cursor ? {cursor} : {}), token: access.token})
    if (result.status === 'auth-required') redirectToUserSignIn({locale: candidate, returnTo})
    return {canMutate: true, result}
  })
  return <SocialSurface className="home-page" header={header} label={messages.posts}><Suspense fallback={<FeedFallback label={messages.posts}/>}><PublicForYouFeed {...(cursor ? {cursor} : {})} labels={messages} locale={candidate} personalization={personalization} publicResult={publicResult} returnTo={returnTo}/></Suspense></SocialSurface>
}

function HomeShell() {
  return <main aria-busy="true" className="home-page" data-home-shell><header aria-hidden="true" className="page-header home-header"><div className="route-skeleton-line route-skeleton-line--short"/></header><div aria-hidden="true"><FeedFallback label=""/></div></main>
}

export async function LocalizedHomePage({searchParams}: {searchParams: Promise<HomeSearchParams>}) {
  const candidate = await rootLocale()
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  const header = <header className="page-header home-header"><h1 className="page-title home-title">{messages.forYou}</h1><FeedTabs currentQuery="" following={false} labels={messages} locale={candidate}/></header>
  const fallback = <SocialSurface className="home-page" header={header} label={messages.posts}><FeedFallback label={messages.posts}/></SocialSurface>
  return <Suspense fallback={fallback}><HomeQueryContent locale={candidate} messages={messages} searchParams={searchParams}/></Suspense>
}

export default function HomePage({searchParams}: {searchParams: Promise<HomeSearchParams>}) {
  return <Suspense fallback={<HomeShell/>}><LocalizedHomePage searchParams={searchParams}/></Suspense>
}
