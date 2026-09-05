'use client'

import {PublicIpProfileSchema, type FeedPost, type PublicPostMedia} from '@aifans/contracts'
import {useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {EmptyState} from '@aifans/ui'
import {PostCard} from './PostCard'
import type {SocialLabels} from './types'
import styles from './PublicProfileContent.module.css'

type GalleryItem = {media: PublicPostMedia; publishedAt: string}

function dayKey(timestamp: string, timeZone: string | undefined) {
  if (!timeZone) return timestamp.slice(0, 10)
  const parts = new Intl.DateTimeFormat('en-CA', {day: '2-digit', month: '2-digit', timeZone, year: 'numeric'}).formatToParts(new Date(timestamp))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function dayLabel(timestamp: string, locale: Locale, timeZone: string | undefined) {
  if (!timeZone) return dayKey(timestamp, undefined)
  return new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'long', timeZone, year: 'numeric'}).format(new Date(timestamp))
}

type PublicProfileTabsProps = {canMutate: boolean; labels: SocialLabels; locale: Locale; posts: PublicIpProfilePosts; profileId: string; referenceTime: number; returnTo: string; viewerScope?: string}

export function PublicProfileTabs(props: PublicProfileTabsProps) {
  const scope = JSON.stringify([props.profileId, props.viewerScope ?? 'guest', props.posts])
  return <ScopedPublicProfileTabs key={scope} {...props}/>
}

function ScopedPublicProfileTabs({canMutate, labels, locale, posts, profileId, referenceTime, returnTo, viewerScope}: PublicProfileTabsProps) {
  const [active, setActive] = useState<'posts' | 'media'>('posts')
  const [items, setItems] = useState(posts.items)
  const [nextCursor, setNextCursor] = useState(posts.nextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [timeZone, setTimeZone] = useState<string>()
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const restoreFocus = useRef(false)
  const closeButton = useRef<HTMLButtonElement | null>(null)
  const viewer = useRef<HTMLDivElement | null>(null)
  const postsTab = useRef<HTMLButtonElement | null>(null)
  const mediaTab = useRef<HTMLButtonElement | null>(null)
  const loadController = useRef<AbortController | null>(null)
  const loadRequestId = useRef(0)
  const mediaItems = useMemo<GalleryItem[]>(() => items.flatMap((post) => (post.media ?? []).map((media) => ({media, publishedAt: post.publishedAt}))), [items])
  const groups = useMemo(() => {
    const output: Array<{key: string; label: string; items: Array<GalleryItem & {index: number}>}> = []
    mediaItems.forEach((item, index) => {
      const key = dayKey(item.publishedAt, timeZone)
      const current = output.at(-1)
      if (current?.key === key) current.items.push({...item, index})
      else output.push({key, label: dayLabel(item.publishedAt, locale, timeZone), items: [{...item, index}]})
    })
    return output
  }, [locale, mediaItems, timeZone])
  const viewerItem = viewerIndex === null ? null : mediaItems[viewerIndex]

  function closeViewer() {
    restoreFocus.current = true
    setViewerIndex(null)
  }

  function selectTab(tab: 'posts' | 'media') {
    setActive(tab)
    ;(tab === 'posts' ? postsTab : mediaTab).current?.focus()
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    const requestId = ++loadRequestId.current
    const controller = new AbortController()
    loadController.current = controller
    setLoadingMore(true)
    setLoadError(false)
    try {
      const response = await fetch(`/api/social/profiles/${profileId}?${new URLSearchParams({cursor: nextCursor})}`, {credentials: 'same-origin', signal: controller.signal})
      const parsed = response.ok ? PublicIpProfileSchema.safeParse(await response.json()) : null
      if (!parsed?.success || parsed.data.profile.id !== profileId) throw new Error('INVALID_PROFILE_PAGE')
      if (controller.signal.aborted || requestId !== loadRequestId.current) return
      setItems((current) => {
        const ids = new Set(current.map((post) => post.id))
        return [...current, ...parsed.data.posts.items.filter((post) => !ids.has(post.id))]
      })
      setNextCursor(parsed.data.posts.nextCursor)
    } catch {
      if (!controller.signal.aborted && requestId === loadRequestId.current) setLoadError(true)
    } finally {
      if (!controller.signal.aborted && requestId === loadRequestId.current) {
        loadController.current = null
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => () => {
    loadRequestId.current += 1
    loadController.current?.abort()
  }, [])

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  }, [])

  useEffect(() => {
    if (viewerIndex === null && restoreFocus.current) {
      restoreFocus.current = false
      opener.current?.focus()
    }
  }, [viewerIndex])

  useEffect(() => {
    if (!viewerItem) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeViewer()
      if (event.key === 'ArrowRight') setViewerIndex((value) => value === null ? null : (value + 1) % mediaItems.length)
      if (event.key === 'ArrowLeft') setViewerIndex((value) => value === null ? null : (value - 1 + mediaItems.length) % mediaItems.length)
      if (event.key === 'Tab') {
        const focusable = [...(viewer.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
        if (!focusable.length) return
        event.preventDefault()
        const current = focusable.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current + 1) % focusable.length
        focusable[next]?.focus()
      }
    }
    const onFocusIn = (event: FocusEvent) => { if (!viewer.current?.contains(event.target as Node)) closeButton.current?.focus() }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [mediaItems.length, viewerItem])

  const postsId = 'profile-posts-panel'
  const mediaId = 'profile-media-panel'
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'End') {event.preventDefault(); selectTab('media')}
    if (event.key === 'ArrowLeft' || event.key === 'Home') {event.preventDefault(); selectTab('posts')}
  }
  const loadMoreControl = nextCursor ? <><button className={styles.loadMore} disabled={loadingMore} onClick={() => void loadMore()} type="button">{labels.loadMore}</button>{loadError ? <p className={styles.loadError} role="alert">{labels.interactionError}</p> : null}</> : null
  return <section className={styles.postsSection}>
    <div aria-label={labels.profileContentTabs ?? 'Profile content'} className={styles.tabList} role="tablist">
      <button aria-controls={postsId} aria-selected={active === 'posts'} className={styles.tab} id="profile-posts-tab" onClick={() => setActive('posts')} onKeyDown={onTabKeyDown} ref={postsTab} role="tab" tabIndex={active === 'posts' ? 0 : -1} type="button">{labels.posts}</button>
      <button aria-controls={mediaId} aria-selected={active === 'media'} className={styles.tab} id="profile-media-tab" onClick={() => setActive('media')} onKeyDown={onTabKeyDown} ref={mediaTab} role="tab" tabIndex={active === 'media' ? 0 : -1} type="button">{labels.profileMedia ?? labels.postMedia}</button>
    </div>
    <div aria-labelledby="profile-posts-tab" hidden={active !== 'posts'} id={postsId} role="tabpanel">
      {items.length ? items.map((post) => <PostCard canMutate={canMutate} key={post.id} labels={labels} locale={locale} post={post} referenceTime={referenceTime} returnTo={returnTo} {...(viewerScope ? {viewerScope} : {})}/>) : <div className={styles.empty}><EmptyState description={labels.homeEmptyDescription} title={labels.homeEmptyTitle}/></div>}
      {loadMoreControl}
    </div>
    <div aria-labelledby="profile-media-tab" className={styles.mediaPanel} hidden={active !== 'media'} id={mediaId} role="tabpanel">
      {groups.length ? groups.map((group) => <section className={styles.mediaDay} key={group.key}>
        <h2>{group.label}</h2>
        <div className={styles.mediaGrid}>{group.items.map(({media, index}) => {
          const alt = media.altText ?? `${labels.profileMedia ?? labels.postMedia} ${index + 1}`
          return <button aria-label={alt} className={styles.mediaThumbnail} key={media.id} onClick={(event) => {opener.current = event.currentTarget; setViewerIndex(index)}} type="button"><img alt="" height={media.height ?? undefined} loading="lazy" src={media.url} width={media.width ?? undefined}/></button>
        })}</div>
      </section>) : <div className={styles.empty}><EmptyState description={labels.profileMediaEmptyDescription ?? 'Images shared in posts appear here.'} title={labels.profileMediaEmptyTitle ?? 'No media yet'}/></div>}
      {loadMoreControl}
    </div>
    {viewerItem ? <div className={styles.viewerBackdrop} onClick={(event) => {event.stopPropagation(); if (event.target === event.currentTarget) closeViewer()}}>
      <div aria-label={labels.profileMedia ?? labels.postMedia} aria-modal="true" className={styles.viewer} onClick={(event) => {event.stopPropagation(); if (event.target === event.currentTarget) closeViewer()}} ref={viewer} role="dialog">
        <button aria-label={labels.profileMediaClose ?? 'Close'} className={styles.viewerClose} onClick={closeViewer} ref={closeButton} type="button">×</button>
        <img alt={viewerItem.media.altText ?? `${labels.profileMedia ?? labels.postMedia} ${(viewerIndex ?? 0) + 1}`} src={viewerItem.media.url}/>
        {mediaItems.length > 1 ? <>
          <button aria-label={labels.profileMediaPrevious ?? 'Previous'} className={`${styles.viewerNav} ${styles.viewerPrevious}`} onClick={() => setViewerIndex((value) => value === null ? null : (value - 1 + mediaItems.length) % mediaItems.length)} type="button">‹</button>
          <button aria-label={labels.profileMediaNext ?? 'Next'} className={`${styles.viewerNav} ${styles.viewerNext}`} onClick={() => setViewerIndex((value) => value === null ? null : (value + 1) % mediaItems.length)} type="button">›</button>
        </> : null}
      </div>
    </div> : null}
  </section>
}

type PublicIpProfilePosts = {items: FeedPost[]; nextCursor: string | null}
