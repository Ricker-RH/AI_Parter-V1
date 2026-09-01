import {notFound} from 'next/navigation'
import {ActivityTabs} from '../../../components/social/ActivityTabs'
import {FeedContent} from '../../../components/social/FeedContent'
import {NotificationsContent} from '../../../components/social/NotificationsContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../lib/auth/access-policy'
import {fetchBookmarks, fetchLiked, fetchNotifications} from '../../../lib/social-api'

type ActivityTab = 'notifications' | 'liked' | 'saved'
function tabValue(value: string | undefined): ActivityTab {
  return value === 'liked' || value === 'saved' ? value : 'notifications'
}

export default async function ActivityPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{tab?: string; cursor?: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const paramsValue = await searchParams
  const tab = tabValue(paramsValue.tab)
  const cursor = paramsValue.cursor
  const query = new URLSearchParams({tab})
  if (cursor) query.set('cursor', cursor)
  const returnTo = `/${locale}/activity?${query}`
  const access = await requireAuthenticatedPage({locale, returnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') return <main><header className="page-header"><h1 className="page-title">{messages.activity ?? messages.notifications}</h1></header><ActivityTabs labels={messages} locale={locale} selected={tab}/>{tab === 'notifications' ? <NotificationsContent labels={messages} locale={locale} result={{status: 'unavailable'}} /> : <FeedContent empty={tab === 'liked' ? 'liked' : 'bookmarks'} labels={messages} locale={locale} result={{status: 'unavailable'}} />}</main>

  if (tab === 'notifications') {
    const result = await fetchNotifications({cursor, token: access.token})
    if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
    const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
    const moreHref = nextCursor ? `/${locale}/activity?${new URLSearchParams({tab, cursor: nextCursor})}` : undefined
    return <main><header className="page-header"><h1 className="page-title">{messages.activity ?? messages.notifications}</h1></header><ActivityTabs labels={messages} locale={locale} selected={tab}/><NotificationsContent labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
  }
  const result = tab === 'liked' ? await fetchLiked({cursor, token: access.token}) : await fetchBookmarks({cursor, token: access.token})
  if (result.status === 'auth-required') redirectToUserSignIn({locale, returnTo})
  const nextCursor = result.status === 'ok' ? result.data.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/activity?${new URLSearchParams({tab, cursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.activity ?? messages.notifications}</h1></header><ActivityTabs labels={messages} locale={locale} selected={tab}/><FeedContent canMutate empty={tab === 'liked' ? 'liked' : 'bookmarks'} labels={messages} locale={locale} moreHref={moreHref} result={result} returnTo={returnTo} /></main>
}
