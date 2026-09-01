'use client'

import type {FeedPost} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {ProfileFollowButton} from './ProfileFollowButton'
import type {SocialLabels} from './types'

type AuthorPreviewProps = {
  author: FeedPost['author']
  canMutate: boolean
  followsAuthor?: boolean
  labels: SocialLabels
  locale: Locale
  returnTo: string
}

export function AuthorPreview({author, canMutate, followsAuthor, labels, locale, returnTo}: AuthorPreviewProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const profileHref = `/${locale}/profiles/${author.id}`
  const profileLabel = labels.profile ?? 'Profile'

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    dialog.current?.querySelector<HTMLElement>('a, button')?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('a, button:not([disabled])') ?? [])]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [open])

  const followAction = canMutate && followsAuthor !== undefined
    ? <ProfileFollowButton following={followsAuthor} labels={labels} locale={locale} profileId={author.id}/>
    : <Link className="author-preview-primary" href={authHref(locale, returnTo)}>{labels.follow}</Link>
  const messagesHref = canMutate ? `/${locale}/messages` : authHref(locale, returnTo)

  return <div className="author-preview">
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={`${profileLabel}: ${author.displayName}`} className="post-avatar-trigger" onClick={() => setOpen(true)} ref={trigger} type="button">
      <span aria-hidden="true" className="avatar">{author.displayName.slice(0, 1)}</span>
    </button>
    {open ? <div className="author-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <div aria-label={author.displayName} aria-modal="true" className="author-preview-dialog" ref={dialog} role="dialog">
        <div className="author-preview-heading">
          <div><Link href={profileHref}><strong>{author.displayName}</strong></Link><span>@{author.username}</span></div>
          <Link aria-label={`${profileLabel}: ${author.displayName}`} className="author-preview-avatar" href={profileHref}>{author.displayName.slice(0, 1)}</Link>
        </div>
        {author.bio ? <p>{author.bio}</p> : null}
        {author.creator ? <p className="creator-attribution">{labels.createdBy} @{author.creator.username}</p> : null}
        <div className="author-preview-actions">{followAction}<Link href={messagesHref}>{labels.messages ?? 'Messages'}</Link></div>
      </div>
    </div> : null}
  </div>
}
