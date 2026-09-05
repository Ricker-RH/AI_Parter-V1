'use client'

import {useQueryClient} from '@tanstack/react-query'
import {useCallback, useEffect, useSyncExternalStore} from 'react'
import type {Locale} from '../i18n/config'
import {useOptionalCurrentAccount} from './account/CurrentAccountProvider'
import {humanInboxQueryOptions} from './chat/human-inbox-query'
import {aiInboxQueryOptions} from './chat/ai-inbox-query'

type Inbox = {items: Array<{unreadCount: number}>; cursor: string | null}
type AiInbox = {status: 'ok'; data: {items: Array<{unreadCount?: number}>; nextCursor: string | null}} | {status: 'auth-required' | 'unavailable'}

export function MobileUnreadBadge({locale}: {locale: Locale}) {
  const client = useQueryClient()
  const current = useOptionalCurrentAccount()
  const account = current?.account
  const profileId = account?.kind === 'human' ? account.id : null
  const aiKey = profileId ? ['ai-chat', `human:${profileId}`, locale, 'inbox', null] as const : null
  useEffect(() => {
    if (!profileId) return
    void client.prefetchQuery(humanInboxQueryOptions(profileId)).catch(() => undefined)
  }, [client, profileId])
  useEffect(() => {
    if (!profileId || !aiKey) return
    void client.prefetchQuery(aiInboxQueryOptions(`human:${profileId}`, locale)).catch(() => undefined)
  }, [client, locale, profileId])
  const getCount = useCallback(() => {
    if (!profileId || !aiKey) return 0
    const inbox = client.getQueryData<Inbox>(['human-chat', profileId, 'inbox']) ?? client.getQueryData<Inbox>(humanInboxQueryOptions(profileId).queryKey)
    const aiInbox = client.getQueryData<AiInbox>(aiKey)
    const aiItems = aiInbox?.status === 'ok' ? aiInbox.data.items : []
    return (inbox?.items.reduce((total, item) => total + item.unreadCount, 0) ?? 0) + aiItems.reduce((total, item) => total + (item.unreadCount ?? 0), 0)
  }, [aiKey, client, profileId])
  const subscribe = useCallback((listener: () => void) => client.getQueryCache().subscribe(event => {
    const key = event.query.queryKey
    if ((key[0] === 'human-chat' && key[1] === profileId && (key[2] === 'inbox' || key[2] === 'inbox-page')) || (key[0] === 'ai-chat' && key[1] === `human:${profileId}` && key[2] === locale && key[3] === 'inbox' && key[4] === null)) listener()
  }), [client, locale, profileId])
  const count = useSyncExternalStore(subscribe, getCount, () => 0)
  if (!count) return null
  const label = locale === 'zh-CN' ? `${count} 条未读消息` : `${count} unread messages`
  return <span aria-label={label} className="mobile-unread-badge">{count > 99 ? '99+' : count}</span>
}
