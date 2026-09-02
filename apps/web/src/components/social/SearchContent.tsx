import type {FeedPage, SearchCategory, SearchPage} from '@aifans/contracts'
import {EmptyState} from '@aifans/ui'
import Link from 'next/link'
import {authHref} from '../../lib/auth/return-to'
import type {Locale} from '../../i18n/config'
import type {SocialApiResult} from '../../lib/social-api'
import {PostCard} from './PostCard'
import {ResultState} from './ResultState'
import type {SocialLabels} from './types'
import {SearchAnalytics} from './SearchAnalytics'
import {ProfileResult} from './ProfileResult'
import {ProfileFollowButton} from './ProfileFollowButton'
import {SearchComposer} from './SearchComposer'
import {SocialSurface} from './SocialSurface'
import {rankPopularSearchResults} from './search-ranking'
import styles from './SearchContent.module.css'

const categories: ReadonlyArray<{key: SearchCategory; label: 'searchPopular' | 'searchRecent' | 'searchProfiles'}> = [
  {key: 'all', label: 'searchPopular'},
  {key: 'posts', label: 'searchRecent'},
  {key: 'ips', label: 'searchProfiles'},
]

function searchHref(locale: Locale, q: string, category: SearchCategory, cursor?: string) {
  const params = new URLSearchParams({q, ...(category === 'all' ? {} : {category})})
  if (cursor) params.set('cursor', cursor)
  return `/${locale}/search?${params}`
}

function SearchEmptyIcon() {
  return <svg aria-hidden="true" className={styles.emptyIcon} fill="none" viewBox="0 0 48 48"><circle cx="21" cy="21" r="12" stroke="currentColor" strokeWidth="2"/><path d="m30 30 9 9" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>
}

function Recommendations({canMutate, labels, locale, result}: {canMutate: boolean; labels: SocialLabels; locale: Locale; result?: SocialApiResult<FeedPage>}) {
  const recommendationLabel = labels.searchRecommended ?? labels.recommendations ?? labels.search ?? (locale === 'zh-CN' ? '推荐关注' : 'Recommended follows')
  if (!result || result.status !== 'ok') return <div data-social-surface-fill>{result ? <ResultState labels={labels} result={result}/> : null}</div>
  const recommendations = new Map<string, {profile: FeedPage['items'][number]['author']; follows?: boolean}>()
  for (const post of result.data.items) {
    if (!recommendations.has(post.author.id)) recommendations.set(post.author.id, {profile: post.author, ...(post.viewerFollowsAuthor === undefined ? {} : {follows: post.viewerFollowsAuthor})})
    if (recommendations.size >= 8) break
  }
  if (!recommendations.size) return <div className={styles.empty} data-social-surface-fill><EmptyState description={labels.recommendationsEmpty ?? labels.searchEmptyDescription ?? labels.homeEmptyDescription} title={recommendationLabel}/></div>
  const returnTo = `/${locale}/search`
  return <section aria-labelledby="search-recommendations-title" className={styles.recommendations}>
    <h2 id="search-recommendations-title">{recommendationLabel}</h2>
    {Array.from(recommendations.values()).map(({profile, follows}) => {
      const href = canMutate ? `/${locale}/profiles/${profile.id}` : authHref(locale, `/${locale}/profiles/${profile.id}`)
      const action = canMutate && follows !== undefined
        ? <ProfileFollowButton following={follows} labels={labels} locale={locale} profileId={profile.id}/>
        : !canMutate ? <Link aria-label={labels.follow} className={styles.followLink} href={authHref(locale, returnTo)}>{labels.follow}</Link> : null
      return <ProfileResult {...(action ? {action} : {})} href={href} key={profile.id} labels={labels} profile={profile}/>
    })}
  </section>
}

export function SearchContent({locale, labels, query, category, cursor, result, recommendationResult, canMutate = false}: {
  locale: Locale
  labels: SocialLabels
  query?: string
  category: SearchCategory
  cursor?: string
  result?: SocialApiResult<SearchPage>
  recommendationResult?: SocialApiResult<FeedPage>
  canMutate?: boolean
}) {
  const referenceTime = Date.now()
  const normalized = query?.trim().replace(/\s+/g, ' ') ?? ''
  const searchLabel = labels.search ?? (locale === 'zh-CN' ? '搜索' : 'Search')
  const returnTo = normalized ? searchHref(locale, normalized, category, cursor) : `/${locale}/search`
  const profileHref = (profileId: string) => canMutate ? `/${locale}/profiles/${profileId}` : authHref(locale, `/${locale}/profiles/${profileId}`)
  const header = <header className={styles.header}>
    <h1 className="sr-only">{searchLabel}</h1>
    <SearchComposer category={category} initialQuery={normalized} labels={{input: labels.searchInput ?? labels.search ?? 'Search', submit: labels.searchSubmit ?? labels.search ?? 'Search', suggestions: labels.searchSuggestions ?? labels.search ?? 'Search suggestions', ...(labels.searchForQuery ? {searchForQuery: labels.searchForQuery} : {})}} locale={locale}/>
    {normalized ? <nav aria-label={labels.searchCategory ?? labels.search} className={styles.tabs} role="tablist">
      {categories.map((item) => <Link aria-selected={category === item.key} className={styles.tab} href={searchHref(locale, normalized, item.key)} key={item.key} role="tab">{labels[item.label] ?? item.key}</Link>)}
    </nav> : null}
  </header>

  let content
  if (!normalized) content = <Recommendations canMutate={canMutate} labels={labels} locale={locale} {...(recommendationResult ? {result: recommendationResult} : {})}/>
  else if (!result || result.status !== 'ok') content = <div data-social-surface-fill>{result ? <ResultState labels={labels} result={result}/> : null}</div>
  else if (!result.data.items.length) content = <div className={styles.empty} data-social-surface-fill><SearchEmptyIcon/><EmptyState {...(labels.searchNoResultsDescription ? {description: labels.searchNoResultsDescription} : {})} title={labels.searchNoResults ?? labels.searchEmptyTitle ?? labels.homeEmptyTitle}/></div>
  else {
    const items = category === 'all' ? rankPopularSearchResults(result.data.items, normalized) : result.data.items
    content = <section aria-label={labels.searchResults ?? labels.search} className={styles.results}><div className="feed-list">
      {items.map((item) => item.type === 'post'
        ? <PostCard canMutate={canMutate} key={`post-${item.post.id}`} labels={labels} locale={locale} post={item.post} referenceTime={referenceTime} returnTo={returnTo}/>
        : <ProfileResult href={profileHref(item.profile.id)} key={`profile-${item.profile.id}`} labels={labels} profile={item.profile}/>)
      }
      {result.data.nextCursor ? <Link className="load-more" href={searchHref(locale, normalized, category, result.data.nextCursor)}>{labels.loadMore}</Link> : null}
    </div></section>
  }

  return <>
    {normalized ? <SearchAnalytics category={category} locale={locale} queryLength={normalized.length}/> : null}
    <SocialSurface className="search-page" header={header} label={normalized ? labels.searchResults ?? searchLabel : labels.searchRecommended ?? labels.recommendations ?? searchLabel}>{content}</SocialSurface>
  </>
}
