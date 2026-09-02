import {notFound} from 'next/navigation'
import {ActivityTabs} from '../../../components/social/ActivityTabs'
import {FeedContent} from '../../../components/social/FeedContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'
import {fetchBookmarks, fetchLiked} from '../../../lib/social-api'

export const instant = false

type ActivityTab = 'liked' | 'saved'
type SearchParams = {tab?: string | string[]; cursor?: string | string[]}

function stringValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function tabValue(value: string | undefined): ActivityTab {
  return value === 'saved' ? value : 'liked'
}

export default async function ActivityPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<SearchParams>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const paramsValue = await searchParams
  const tab = tabValue(stringValue(paramsValue.tab))
  const cursor = stringValue(paramsValue.cursor)
  const query = new URLSearchParams({tab})
  if (cursor) query.set('cursor', cursor)
  const returnTo = `/${locale}/activity?${query}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <main><h1 className="sr-only">{messages.collections}</h1><ActivityTabs labels={messages} locale={locale} selected={tab}/><FeedContent empty={tab === 'liked' ? 'liked' : 'bookmarks'} labels={messages} locale={locale} result={{status: 'unavailable'}} /></main>
  const result = tab === 'liked' ? await fetchLiked({cursor, token: access.token}) : await fetchBookmarks({cursor, token: access.token})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/activity?${new URLSearchParams({tab, cursor: nextCursor})}` : undefined
  return <main><h1 className="sr-only">{messages.collections}</h1><ActivityTabs labels={messages} locale={locale} selected={tab}/><FeedContent canMutate empty={tab === 'liked' ? 'liked' : 'bookmarks'} labels={messages} locale={locale} moreHref={moreHref} result={result} returnTo={returnTo} /></main>
}
