import {Suspense} from 'react'
import {notFound} from 'next/navigation'
import {CachedHomeRoute} from '../../components/social/CachedHomeRoute'
import {getMessages, isLocale} from '../../i18n/config'
import {locale as rootLocale} from 'next/root-params'

export const instant = true

type HomeSearchParams = Record<string, string | string[] | undefined>
type Messages = Awaited<ReturnType<typeof getMessages>>

function FeedFallback({label}: {label: string}) {
  return <div aria-busy="true" aria-label={label} className="route-skeleton route-skeleton--feed" data-home-feed-fallback role="status"><div aria-hidden="true" className="route-skeleton-content">{Array.from({length: 3}, (_, index) => <div className="route-skeleton-card" key={index}><span className="route-skeleton-avatar"/><span className="route-skeleton-card-content"><span className="route-skeleton-line route-skeleton-line--short"/><span className="route-skeleton-line"/><span className="route-skeleton-line route-skeleton-line--medium"/></span></div>)}</div></div>
}

export async function HomeQueryContent({locale, messages, searchParams}: {locale: 'en' | 'zh-CN'; messages: Messages; searchParams: Promise<HomeSearchParams>}) {
  // Reading the query keeps the PPR boundary dynamic. Feed data itself belongs
  // to the persistent client cache so query navigation never waits on it here.
  await searchParams
  return <CachedHomeRoute labels={messages} locale={locale}/>
}

export async function LocalizedHomePage({searchParams}: {searchParams: Promise<HomeSearchParams>}) {
  const candidate = await rootLocale()
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  const fallback = <main className="home-page"><FeedFallback label={messages.posts}/></main>
  return <Suspense fallback={fallback}><HomeQueryContent locale={candidate} messages={messages} searchParams={searchParams}/></Suspense>
}

export default function HomePage({searchParams}: {searchParams: Promise<HomeSearchParams>}) {
  return <LocalizedHomePage searchParams={searchParams}/>
}
