'use client'

import {PublicIpProfileSchema, type FeedPost} from '@aifans/contracts'
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
  context?: 'post' | 'comment'
}

export function AuthorPreview({author, canMutate, followsAuthor, labels, locale, returnTo, context = 'post'}: AuthorPreviewProps) {
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<{followerCount: number; viewerFollows?: boolean} | null>(null)
  const [followingOverride, setFollowingOverride] = useState<boolean>()
  const [profileState, setProfileState] = useState<'idle' | 'loading' | 'error'>('idle')
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const profileRequestId = useRef(0)
  const profileHref = `/${locale}/profiles/${author.id}`
  const profileLabel = labels.profile ?? 'Profile'

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    profileRequestId.current += 1
    setProfile(null)
    setFollowingOverride(undefined)
    setProfileState('idle')
  }, [author.id])

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
      if (!dialog.current?.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
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

  useEffect(() => {
    if (!open || profile) return
    const requestId = ++profileRequestId.current
    const controller = new AbortController()
    setProfileState('loading')
    void fetch(`/api/social/profiles/${author.id}`, {credentials: 'include', signal: controller.signal})
      .then(async (response) => {
        const parsed = response.ok ? PublicIpProfileSchema.safeParse(await response.json()) : null
        if (!parsed?.success) throw new Error('profile unavailable')
        if (controller.signal.aborted || requestId !== profileRequestId.current) return
        setProfile({followerCount: parsed.data.followerCount, ...(parsed.data.viewerFollows === undefined ? {} : {viewerFollows: parsed.data.viewerFollows})})
        setProfileState('idle')
      })
      .catch(() => {
        if (!controller.signal.aborted && requestId === profileRequestId.current) setProfileState('error')
      })
    return () => controller.abort()
  }, [author.id, open, profile])

  const resolvedFollowing = followingOverride ?? followsAuthor ?? profile?.viewerFollows
  const followAction = canMutate
    ? resolvedFollowing === undefined ? null : <ProfileFollowButton following={resolvedFollowing} labels={labels} locale={locale} onFollowingChange={setFollowingOverride} profileId={author.id}/>
    : <Link className="author-preview-primary" href={authHref(locale, returnTo)}>{labels.follow}</Link>
  const triggerClass = context === 'comment' ? 'comment-avatar-trigger' : 'post-avatar-trigger'
  const avatarClass = context === 'comment' ? 'comment-avatar' : 'avatar'

  return <div className="author-preview">
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={`${profileLabel}: ${author.displayName}`} className={triggerClass} onClick={() => setOpen(true)} ref={trigger} type="button">
      <span aria-hidden="true" className={avatarClass}>{author.displayName.slice(0, 1)}</span>
    </button>
    {open ? <div className="author-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <div aria-label={author.displayName} aria-modal="true" className="author-preview-dialog" ref={dialog} role="dialog">
        <div className="author-preview-heading">
          <div><Link href={profileHref}><strong>{author.displayName}</strong></Link><span>@{author.username}</span></div>
          <Link aria-label={`${profileLabel}: ${author.displayName}`} className="author-preview-avatar" href={profileHref}>{author.displayName.slice(0, 1)}</Link>
        </div>
        {author.bio ? <p className="author-preview-bio">{author.bio}</p> : null}
        {author.creator ? <p className="creator-attribution">{labels.createdBy} @{author.creator.username}</p> : null}
        {profileState === 'loading' ? <p aria-live="polite" className="author-preview-followers">…</p> : profile ? <p className="author-preview-followers">{profile.followerCount} {labels.followers}</p> : profileState === 'error' ? <p className="author-preview-followers">{labels.unavailableDescription}</p> : null}
        {followAction ? <div className="author-preview-actions"><div className="author-preview-follow-action">{followAction}</div></div> : null}
        <button aria-label={labels.close ?? 'Close'} className="author-preview-close" onClick={close} type="button"><span aria-hidden="true">×</span></button>
      </div>
    </div> : null}
  </div>
}
