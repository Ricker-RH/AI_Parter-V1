'use client'

import {useLayoutEffect, useRef, type CSSProperties} from 'react'
import styles from './ProfileCover.module.css'

/** Decorative only: the existing header and scroll container retain their layout. */
export function ProfileCover({backgroundStyle, type = 'color'}: {backgroundStyle?: CSSProperties; type?: string}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const cover = ref.current
    const host = cover?.parentElement
    const surface = host?.querySelector<HTMLElement>('[data-profile-cover-surface]')
    const tabs = surface?.querySelector<HTMLElement>('[role="tablist"]')
    const header = host?.querySelector<HTMLElement>(':scope > header')
    if (!cover || !host || !surface || !tabs || !header) return
    const update = () => {
      const top = host.getBoundingClientRect().top
      const headerHeight = header.getBoundingClientRect().bottom - top
      const bottom = tabs.getBoundingClientRect().bottom - top
      cover.style.height = `${Math.max(headerHeight, bottom)}px`
      cover.style.setProperty('--cover-full-height', `${bottom + surface.scrollTop}px`)
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    // Observe in-flow elements only; changing the decorative layer cannot resize them.
    for (const element of [host, header, tabs, ...surface.children]) observer?.observe(element)
    surface.addEventListener('scroll', update, {passive: true})
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      surface.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return <div aria-hidden="true" className={styles.clip} ref={ref}>
    <div className={styles.image} data-profile-background data-background-type={type} style={backgroundStyle}/>
  </div>
}
