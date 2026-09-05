'use client'

import {type FeedPost} from '@aifans/contracts'
import {QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import Link from 'next/link'
import {useContext, useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import {ProfileFollowButton} from './ProfileFollowButton'
import {StartChatButton} from '../chat/StartChatButton'
import {Avatar} from '../account/Avatar'
import type {SocialLabels} from './types'
import {ipProfileCacheKey, loadIpProfile} from '../profile/profile-cache'

type AuthorPreviewProps = {
  author: FeedPost['author']
  canMutate: boolean
  followsAuthor?: boolean
  labels: SocialLabels
  locale: Locale
  returnTo: string
  context?: 'post' | 'comment'
  viewerScope?: string
}

function ScopedAuthorPreview({author, canMutate, followsAuthor, labels, locale, returnTo, context = 'post', viewerScope}: AuthorPreviewProps) {
  const [open, setOpen] = useState(false)
  const [followingOverride, setFollowingOverride] = useState<boolean>()
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const profileHref = `/${locale}/profiles/${author.id}`
  const profileLabel = labels.profile ?? 'Profile'
  const queryKey = ipProfileCacheKey(author.id, viewerScope)
  const preview = useQuery({
    queryKey,
    queryFn: ({signal}) => loadIpProfile(author.id, signal),
    enabled: open,
    retry: false,
    staleTime: 30_000,
  })
  const profile = preview.data ?? null

  function prefetchProfile() {
    void queryClient.prefetchQuery({
      queryKey,
      queryFn: ({signal}) => loadIpProfile(author.id, signal),
      staleTime: 30_000,
    })
  }

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

  const resolvedFollowing = followingOverride ?? followsAuthor ?? profile?.viewerFollows
  const followAction = canMutate
    ? !viewerScope ? null : <ProfileFollowButton following={resolvedFollowing ?? false} labels={labels} locale={locale} onFollowingChange={setFollowingOverride} profileId={author.id} rollbackOnUnmount viewerScope={viewerScope}/>
    : <Link className="author-preview-primary" href={authHref(locale, returnTo)}>{labels.follow}</Link>
  const chatAction = <StartChatButton authenticated={canMutate} ipProfileId={author.id} labels={{startChat: labels.startChat, startingChat: labels.startingChat, chatStartError: labels.chatStartError}} locale={locale}/>
  const triggerClass = context === 'comment' ? 'comment-avatar-trigger' : 'post-avatar-trigger'
  const avatarClass = context === 'comment' ? 'comment-avatar' : 'avatar'
  const modal = <div className="author-preview-backdrop" data-author-preview-backdrop onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) close() }}>
    <div aria-label={author.displayName} aria-modal="true" className="author-preview-dialog" onMouseDown={(event) => event.stopPropagation()} ref={dialog} role="dialog">
      <div className="author-preview-heading">
        <div><Link href={profileHref}><strong>{author.displayName}</strong></Link><span>@{author.username}</span></div>
        <Link aria-label={`${profileLabel}: ${author.displayName}`} className="author-preview-avatar" href={profileHref}><Avatar avatarUrl={null} decorative displayName={author.displayName} identityId={author.id} kind="ip" size="large"/></Link>
      </div>
      {author.bio ? <p className="author-preview-bio">{author.bio}</p> : null}
      {author.creator ? <p className="creator-attribution">{labels.createdBy} @{author.creator.username}</p> : null}
      {preview.isPending ? <p aria-live="polite" className="author-preview-followers">…</p> : profile ? <p className="author-preview-followers">{profile.followerCount} {labels.followers}</p> : preview.isError ? <p className="author-preview-followers">{labels.unavailableDescription}</p> : null}
      {followAction ? <div className="author-preview-actions"><div className="author-preview-follow-action">{followAction}</div><div className="author-preview-chat-action">{chatAction}</div></div> : null}
    </div>
  </div>

  return <div className="author-preview">
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={`${profileLabel}: ${author.displayName}`} className={triggerClass} onClick={() => setOpen(true)} onFocus={prefetchProfile} onPointerDown={prefetchProfile} onPointerEnter={prefetchProfile} ref={trigger} type="button">
      <Avatar avatarUrl={null} className={avatarClass} decorative displayName={author.displayName} identityId={author.id} kind="ip" size="medium"/>
    </button>
    {open && typeof document !== 'undefined' ? createPortal(modal, document.body) : null}
  </div>
}

export function AuthorPreview(props: AuthorPreviewProps) {
  const scope = `${props.author.id}\u0000${props.viewerScope ?? 'guest'}`
  const shared = useContext(AppQueryContext)
  const [client] = useState(createAppQueryClient)
  const preview = <ScopedAuthorPreview {...props} key={scope}/>
  return shared ? preview : <QueryClientProvider client={client}>{preview}</QueryClientProvider>
}
