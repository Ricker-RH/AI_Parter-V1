'use client'

import {useQueryClient} from '@tanstack/react-query'
import {ChatConversationPageSchema, HumanInboxPageSchema} from '@aifans/contracts'
import {useCallback, useEffect, useSyncExternalStore} from 'react'
import type {Locale} from '../i18n/config'
import {useOptionalCurrentAccount} from './account/CurrentAccountProvider'

type Inbox = {items: Array<{unreadCount: number}>; cursor: string | null}
type AiInbox = {status: 'ok'; data: {items: Array<{unreadCount?: number}>; nextCursor: string | null}} | {status: 'auth-required' | 'unavailable'}

export function MobileUnreadBadge({locale}: {locale: Locale}) {
  const client = useQueryClient()
  const current = useOptionalCurrentAccount()
  const account = current?.account
  const profileId = account?.kind === 'human' ? account.id : null
  const aiKey = profileId ? ['ai-chat', `human:${profileId}`, locale, 'inbox', null] : null
  useEffect(() => {
    if (!profileId) return
    const state = client.getQueryState(['human-chat', profileId, 'inbox'])
    if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < 30_000) return
    const controller = new AbortController()
    void fetch('/api/human-chat/conversations?limit=100', {cache: 'no-store', credentials: 'same-origin', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw Error()
        const page = HumanInboxPageSchema.parse(await response.json())
        if (!controller.signal.aborted) client.setQueryData(['human-chat', profileId, 'inbox'], {items: page.items, cursor: page.nextCursor})
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [client, profileId])
  useEffect(() => {
    if (!profileId || !aiKey) return
    const state = client.getQueryState(aiKey)
    if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < 30_000) return
    const controller = new AbortController()
    void fetch('/api/conversations', {cache: 'no-store', credentials: 'same-origin', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw Error()
        const page = ChatConversationPageSchema.parse(await response.json())
        if (!controller.signal.aborted) client.setQueryData(aiKey, {status: 'ok', data: page})
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [aiKey, client, profileId])
  const getCount = useCallback(() => {
    if (!profileId || !aiKey) return 0
    const inbox = client.getQueryData<Inbox>(['human-chat', profileId, 'inbox'])
    const aiInbox = client.getQueryData<AiInbox>(aiKey)
    const aiItems = aiInbox?.status === 'ok' ? aiInbox.data.items : []
    return (inbox?.items.reduce((total, item) => total + item.unreadCount, 0) ?? 0) + aiItems.reduce((total, item) => total + (item.unreadCount ?? 0), 0)
  }, [aiKey, client, profileId])
  const subscribe = useCallback((listener: () => void) => client.getQueryCache().subscribe(event => {
    const key = event.query.queryKey
    if ((key[0] === 'human-chat' && key[1] === profileId && key[2] === 'inbox') || (key[0] === 'ai-chat' && key[1] === `human:${profileId}` && key[2] === locale && key[3] === 'inbox' && key[4] === null)) listener()
  }), [client, locale, profileId])
  const count = useSyncExternalStore(subscribe, getCount, () => 0)
  if (!count) return null
  const label = locale === 'zh-CN' ? `${count} 条未读消息` : `${count} unread messages`
  return <span aria-label={label} className="mobile-unread-badge">{count > 99 ? '99+' : count}</span>
}
