import {notFound} from 'next/navigation'
import {getMessages, isLocale} from '../../../i18n/config'
import {SearchContent} from '../../../components/social/SearchContent'
import {fetchSearch} from '../../../lib/social-api'
import type {SearchCategory} from '@aifans/contracts'

const validCategories = new Set<SearchCategory>(['all', 'ips', 'posts'])
type SearchParams = Record<string, string | string[] | undefined>
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }

export default async function SearchPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams?: Promise<SearchParams>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const values = await searchParams ?? {}
  const query = first(values.q)?.trim().replace(/\s+/g, ' ') ?? ''
  const candidate = first(values.category)
  const category: SearchCategory = candidate && validCategories.has(candidate as SearchCategory) ? candidate as SearchCategory : 'all'
  const cursor = first(values.cursor)
  const result = query ? await fetchSearch({q: query, category, ...(cursor ? {cursor} : {})}) : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.search}</h1></header><SearchContent category={category} labels={messages} locale={locale} query={query} {...(result === undefined ? {} : {result})} /></main>
}
