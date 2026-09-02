import type {SearchCategory, SearchPage} from '@aifans/contracts'
import {EmptyState} from '@aifans/ui'
import Form from 'next/form'
import Link from 'next/link'
import {authHref} from '../../lib/auth/return-to'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {SearchAnalytics} from './SearchAnalytics'
import {ProfileResult} from './ProfileResult'

const categories: ReadonlyArray<{key: SearchCategory; label: 'searchAll' | 'searchIps' | 'searchPosts'}> = [
  {key: 'all', label: 'searchAll'},
  {key: 'ips', label: 'searchIps'},
  {key: 'posts', label: 'searchPosts'},
]

function searchHref(locale: Locale, q: string, category: SearchCategory, cursor?: string) {
  const params = new URLSearchParams({q, ...(category === 'all' ? {} : {category})})
  if (cursor) params.set('cursor', cursor)
  return `/${locale}/search?${params}`
}

function SearchEmptyIcon() {
  return <svg aria-hidden="true" className="search-empty-icon" fill="none" viewBox="0 0 48 48">
    <circle cx="21" cy="21" r="12" stroke="currentColor" strokeWidth="2" />
    <path d="m30 30 9 9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
  </svg>
}

export function SearchContent({locale, labels, query, category, cursor, result, canMutate = false}: {locale: Locale; labels: SocialLabels; query?: string; category: SearchCategory; cursor?: string; result?: SocialApiResult<SearchPage>; canMutate?: boolean}) {
  const referenceTime = Date.now()
  const normalized = query?.trim().replace(/\s+/g, ' ') ?? ''
  const returnTo = normalized ? searchHref(locale, normalized, category, cursor) : `/${locale}/search`
  const profileHref = (profileId: string) => canMutate ? `/${locale}/profiles/${profileId}` : authHref(locale, `/${locale}/profiles/${profileId}`)
  return <>
    {normalized ? <SearchAnalytics category={category} locale={locale} queryLength={normalized.length} /> : null}
    <Form action={`/${locale}/search`} className="search-form" role="search">
      <label className="sr-only" htmlFor="search-query">{labels.searchInput ?? labels.search}</label>
      <div className="search-form-field">
        <svg aria-hidden="true" className="search-field-icon" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>
        <input autoComplete="off" defaultValue={normalized} id="search-query" maxLength={80} name="q" placeholder={labels.searchInput ?? labels.search} type="search" />
        {category !== 'all' ? <input aria-label={labels.searchCategory ?? 'Search category'} name="category" type="hidden" value={category} /> : null}
        <button aria-label={labels.searchSubmit ?? labels.search} type="submit"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m8 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></svg></button>
      </div>
    </Form>
    <nav aria-label={labels.searchCategory ?? labels.search} className="search-category-tabs">
      <div className="tabs" role="tablist">
        {categories.map((item) => <Link aria-selected={category === item.key} className="tab" href={normalized ? searchHref(locale, normalized, item.key) : `/${locale}/search`} key={item.key} role="tab">{labels[item.label] ?? item.key}</Link>)}
      </div>
    </nav>
    {!normalized || !result ? <div className="search-empty"><SearchEmptyIcon/><EmptyState description={labels.searchEmptyDescription ?? labels.homeEmptyDescription} title={labels.searchEmptyTitle ?? labels.homeEmptyTitle} /></div>
      : result.status !== 'ok' ? <ResultState labels={labels} result={result} />
      : result.data.items.length === 0 ? <div className="search-empty"><SearchEmptyIcon/><EmptyState {...(labels.searchNoResultsDescription ? {description: labels.searchNoResultsDescription} : {})} title={labels.searchNoResults ?? labels.searchEmptyTitle ?? labels.homeEmptyTitle} /></div>
      : <section aria-label={labels.searchResults ?? labels.search} className="search-results"><div className="feed-list">
        {result.data.items.map((item) => item.type === 'post'
          ? <PostCard canMutate={canMutate} key={`post-${item.post.id}`} labels={labels} locale={locale} post={item.post} referenceTime={referenceTime} returnTo={returnTo} />
          : <ProfileResult href={profileHref(item.profile.id)} key={`profile-${item.profile.id}`} labels={labels} profile={item.profile}/>)}
        {result.data.nextCursor ? <Link className="load-more" href={searchHref(locale, normalized, category, result.data.nextCursor)}>{labels.loadMore}</Link> : null}
      </div></section>}
  </>
}
