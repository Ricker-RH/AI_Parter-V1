'use client'

import {useRouter} from 'next/navigation'

const prefetchedUrls = new Set<string>()

function isControlledInternalHref(href: string) {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\') || href.includes('#')) return false
  const url = new URL(href, 'https://aifans.invalid')
  const next = url.searchParams.get('next')
  return url.origin === 'https://aifans.invalid'
    && [...url.searchParams.keys()].every((key) => key === 'next')
    && (next === null || (next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.includes('#')))
}

export function useIntentPrefetch() {
  const router = useRouter()

  function prefetch(href: string) {
    if (!isControlledInternalHref(href) || prefetchedUrls.has(href)) return
    prefetchedUrls.add(href)
    // Next 16.3.3's local type requires its internal kind while the public API defaults to auto.
    const options: NonNullable<Parameters<typeof router.prefetch>[1]> = {
      kind: 'auto' as NonNullable<Parameters<typeof router.prefetch>[1]>['kind'],
      onInvalidate: () => prefetchedUrls.delete(href),
    }
    router.prefetch(href, options)
  }

  function intentHandlers(href: string) {
    return {
      onFocus: () => prefetch(href),
      onPointerEnter: () => prefetch(href),
      onTouchStart: () => prefetch(href),
    }
  }

  return {intentHandlers, prefetch}
}
