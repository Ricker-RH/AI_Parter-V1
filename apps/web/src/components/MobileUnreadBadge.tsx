'use client'

import {useQueryClient} from '@tanstack/react-query'
import {HumanInboxPageSchema} from '@aifans/contracts'
import {useCallback, useEffect, useSyncExternalStore} from 'react'
import type {Locale} from '../i18n/config'
import {useOptionalCurrentAccount} from './account/CurrentAccountProvider'

type Inbox = {items: Array<{unreadCount: number}>; cursor: string | null}

export function MobileUnreadBadge({locale}: {locale: Locale}) {
  const client = useQueryClient()
  const current = useOptionalCurrentAccount()
  const account = current?.account
  const profileId = account?.kind === 'human' ? account.id : null
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
  const getCount = useCallback(() => {
    if (!profileId) return 0
    const inbox = client.getQueryData<Inbox>(['human-chat', profileId, 'inbox'])
    return inbox?.items.reduce((total, item) => total + item.unreadCount, 0) ?? 0
  }, [client, profileId])
  const subscribe = useCallback((listener: () => void) => client.getQueryCache().subscribe(event => {
    if (event.query.queryKey[0] === 'human-chat' && event.query.queryKey[1] === profileId && event.query.queryKey[2] === 'inbox') listener()
  }), [client, profileId])
  const count = useSyncExternalStore(subscribe, getCount, () => 0)
  if (!count) return null
  const label = locale === 'zh-CN' ? `${count} 条未读消息` : `${count} unread messages`
  return <span aria-label={label} className="mobile-unread-badge">{count > 99 ? '99+' : count}</span>
}
