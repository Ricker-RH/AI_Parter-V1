'use client'

import type {Account} from '@aifans/contracts'
import {useState} from 'react'
import styles from './Avatar.module.css'

export type AvatarSize = 'small' | 'medium' | 'large'
export type AvatarKind = 'human' | 'ip'

function haloIndex(identityId: string) {
  let value = 0
  for (const character of identityId) value = (value * 31 + character.codePointAt(0)!) >>> 0
  return String(value % 8)
}

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

export function Avatar({avatarUrl, className, decorative = false, displayName, identityId = '', kind = 'human', size}: {
  avatarUrl: Account['avatarUrl'] | null
  className?: string
  decorative?: boolean
  displayName: string
  identityId?: string
  kind?: AvatarKind
  size: AvatarSize
}) {
  const source = httpUrl(avatarUrl)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const classes = [styles.avatar, styles[size], kind === 'ip' ? styles.ip : '', className].filter(Boolean).join(' ')
  const identity = {'data-avatar-kind': kind, ...(kind === 'ip' ? {'data-avatar-halo': haloIndex(identityId)} : {})}
  const accessibility = decorative
    ? {'aria-hidden': true as const}
    : {role: 'img', 'aria-label': displayName || 'Account'}

  if (source && source !== failedSource) {
    return <span {...identity} aria-hidden={decorative || undefined} className={classes} data-avatar-size={size}>
      <img alt={decorative ? '' : displayName} className={styles.image} onError={() => setFailedSource(source)} src={source}/>
    </span>
  }

  const initial = firstGrapheme(displayName)
  return <span {...accessibility} {...identity} className={classes} data-avatar-size={size}>{initial || <GenericAccountIcon/>}</span>
}
