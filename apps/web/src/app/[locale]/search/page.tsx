import {notFound} from 'next/navigation'
import {getMessages, isLocale} from '../../../i18n/config'
import {SearchContent} from '../../../components/social/SearchContent'
import {fetchFeed, fetchSearch} from '../../../lib/social-api'
import {getOptionalPageAccess, redirectToUserSignIn} from '../../../lib/auth/access-policy'
import type {SearchCategory} from '@aifans/contracts'

export const instant = false

const validCategories = new Set<SearchCategory>(['all', 'ips', 'posts'])
type SearchParams = Record<string, string | string[] | undefined>
const safeCursor = /^[A-Za-z0-9_-]{1,2048}$/

function single(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined
}

function searchQuery(value: string | string[] | undefined) {
  return (single(value)?.trim().replace(/\s+/g, ' ') ?? '').slice(0, 80)
}

export default async function SearchPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams?: Promise<SearchParams>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const values = await searchParams ?? {}
  const query = searchQuery(values.q)
  const candidate = single(values.category)
  const category: SearchCategory = candidate && validCategories.has(candidate as SearchCategory) ? candidate as SearchCategory : 'all'
  const cursorCandidate = single(values.cursor)
  const cursor = cursorCandidate && safeCursor.test(cursorCandidate) ? cursorCandidate : undefined
  const access = await getOptionalPageAccess()
  const canMutate = access.status === 'authenticated'
  const result = query ? await fetchSearch({q: query, category, ...(cursor ? {cursor} : {}), ...(canMutate ? {token: access.token} : {})}) : undefined
  const recommendationResult = query ? undefined : await fetchFeed({kind: 'for_you', locale, ...(canMutate ? {token: access.token} : {})})
  const returnParams = new URLSearchParams({q: query, category, ...(cursor ? {cursor} : {})})
  const returnTo = query ? `/${locale}/search?${returnParams}` : `/${locale}/search`
  if (result?.status === 'auth-required' && canMutate) redirectToUserSignIn({locale, returnTo})
  if (recommendationResult?.status === 'auth-required' && canMutate) redirectToUserSignIn({locale, returnTo})
  return <SearchContent canMutate={canMutate} category={category} labels={messages} locale={locale} query={query} {...(cursor === undefined ? {} : {cursor})} {...(result === undefined ? {} : {result})} {...(recommendationResult === undefined ? {} : {recommendationResult})} {...(access.status === 'authenticated' ? {viewerScope: access.viewerScope} : {})}/>
}
