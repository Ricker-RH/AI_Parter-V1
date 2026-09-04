'use client'

import type {Account} from '@aifans/contracts'
import {useState} from 'react'
import styles from './Avatar.module.css'

export type AvatarSize = 'small' | 'medium' | 'large'

function httpUrl(value: Account['avatarUrl'] | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function firstGrapheme(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  if (typeof Intl.Segmenter === 'function') {
    const iterator = new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(normalized)[Symbol.iterator]()
    return iterator.next().value?.segment.toLocaleUpperCase() ?? ''
  }
  return Array.from(normalized)[0]?.toLocaleUpperCase() ?? ''
}

function GenericAccountIcon() {
  return <svg className={styles.icon} fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6"/><path d="M4.8 20c.8-4 3.2-6 7.2-6s6.4 2 7.2 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/></svg>
}

export function Avatar({avatarUrl, className, decorative = false, displayName, size}: {
  avatarUrl: Account['avatarUrl'] | null
  className?: string
  decorative?: boolean
  displayName: string
  size: AvatarSize
}) {
  const source = httpUrl(avatarUrl)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const classes = [styles.avatar, styles[size], className].filter(Boolean).join(' ')
  const accessibility = decorative
    ? {'aria-hidden': true as const}
    : {role: 'img', 'aria-label': displayName || 'Account'}

  if (source && source !== failedSource) {
    return <span aria-hidden={decorative || undefined} className={classes} data-avatar-size={size}>
      <img alt={decorative ? '' : displayName} className={styles.image} onError={() => setFailedSource(source)} src={source}/>
    </span>
  }

  const initial = firstGrapheme(displayName)
  return <span {...accessibility} className={classes} data-avatar-size={size}>{initial || <GenericAccountIcon/>}</span>
}
