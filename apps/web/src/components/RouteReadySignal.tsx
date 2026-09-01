'use client'

import type {ReactNode} from 'react'
import {useLayoutEffect, useRef} from 'react'
import {usePathname, useSearchParams} from 'next/navigation'

export function RouteReadySignal({content}: {content: ReactNode}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const generation = useRef(0)
  const route = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`
  const latestRoute = useRef(route)
  latestRoute.current = route

  useLayoutEffect(() => {
    let reported = false
    const reportReady = () => {
      if (reported || document.querySelector('.route-skeleton')) return
      const main = document.querySelector<HTMLElement>('main:not(.route-skeleton)')
      if (!main) return
      reported = true
      const nextGeneration = ++generation.current
      main.setAttribute('data-route-ready', latestRoute.current)
      document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail: {generation: nextGeneration, route: latestRoute.current}}))
    }
    reportReady()
    const observer = new MutationObserver(reportReady)
    observer.observe(document.body, {childList: true, subtree: true})
    return () => observer.disconnect()
  }, [content, route])

  return null
}
