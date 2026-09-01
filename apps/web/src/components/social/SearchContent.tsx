import type {SearchCategory, SearchPage} from '@aifans/contracts'
import {EmptyState} from '@aifans/ui'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {SearchAnalytics} from './SearchAnalytics'

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

export function SearchContent({locale, labels, query, category, result, canMutate = false}: {locale: Locale; labels: SocialLabels; query?: string; category: SearchCategory; result?: SocialApiResult<SearchPage>; canMutate?: boolean}) {
  const normalized = query?.trim().replace(/\s+/g, ' ') ?? ''
  return <>
    {normalized ? <SearchAnalytics category={category} locale={locale} queryLength={normalized.length} /> : null}
    <form action={`/${locale}/search`} className="comment-composer" role="search">
      <label htmlFor="search-query">{labels.searchInput ?? labels.search}</label>
      <div className="account-row">
        <input aria-label={labels.search ?? 'Search'} defaultValue={normalized} id="search-query" name="q" placeholder={labels.searchInput ?? labels.search} type="search" />
        {category !== 'all' ? <input aria-label={labels.searchCategory ?? 'Search category'} name="category" type="hidden" value={category} /> : null}
        <button type="submit">{labels.searchSubmit ?? labels.search}</button>
      </div>
    </form>
    <nav aria-label={labels.searchCategory ?? labels.search} className="visual-filter">
      <div className="tabs" role="tablist">
        {categories.map((item) => <Link aria-selected={category === item.key} className="tab" href={normalized ? searchHref(locale, normalized, item.key) : `/${locale}/search`} key={item.key} role="tab">{labels[item.label] ?? item.key}</Link>)}
      </div>
    </nav>
    {!normalized || !result ? <div className="empty"><EmptyState description={labels.searchEmptyDescription ?? labels.homeEmptyDescription} title={labels.searchEmptyTitle ?? labels.homeEmptyTitle} /></div>
      : result.status !== 'ok' ? <ResultState labels={labels} result={result} />
      : result.data.items.length === 0 ? <div className="empty"><EmptyState title={labels.searchNoResults ?? labels.searchEmptyTitle ?? labels.homeEmptyTitle} /></div>
      : <section aria-labelledby="search-results-title" className="search-results"><h2 className="section-title" id="search-results-title">{labels.searchResults ?? labels.search}</h2><div className="feed-list">
        {result.data.items.map((item) => item.type === 'post'
          ? <PostCard canMutate={canMutate} key={`post-${item.post.id}`} labels={labels} locale={locale} post={item.post} returnTo={searchHref(locale, normalized, category)} />
          : <article className="post-card" key={`profile-${item.profile.id}`}><h3>{item.profile.displayName}</h3><p className="author-meta">@{item.profile.username} · {labels[item.profile.visualType] ?? item.profile.visualType}</p>{item.profile.bio ? <p>{item.profile.bio}</p> : null}</article>)}
        {result.data.nextCursor ? <Link className="load-more" href={searchHref(locale, normalized, category, result.data.nextCursor)}>{labels.loadMore}</Link> : <p className="search-end">{labels.searchEnd ?? labels.loadMore}</p>}
      </div></section>}
  </>
}
