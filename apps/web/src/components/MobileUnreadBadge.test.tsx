import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen} from '@testing-library/react'
import {expect, it} from 'vitest'
import {CurrentAccountProvider} from './account/CurrentAccountProvider.js'
import {AppQueryContext} from './AppQueryProvider.js'
import {MobileUnreadBadge} from './MobileUnreadBadge.js'

const account = {id: '11111111-1111-4111-8111-111111111111', kind: 'human' as const, username: 'rui', displayName: 'Rui', avatarUrl: null, preferredLocale: 'en' as const, creatorModeEnabled: false, profileVersion: 1, background: {type: 'color' as const, colorKey: 'paper' as const}}
const key = ['human-chat', account.id, 'inbox']
const aiKey = ['ai-chat', `human:${account.id}`, 'en', 'inbox', null]

it('derives one total from both human and IP inbox caches', () => {
  const client = new QueryClient()
  client.setQueryData(key, {items: [{unreadCount: 2}, {unreadCount: 3}, {unreadCount: 0}], cursor: null})
  client.setQueryData(aiKey, {status: 'ok', data: {items: [{unreadCount: 4}], nextCursor: null}})
  render(<CurrentAccountProvider initialAccount={account}><QueryClientProvider client={client}><AppQueryContext.Provider value><MobileUnreadBadge locale="en"/></AppQueryContext.Provider></QueryClientProvider></CurrentAccountProvider>)
  expect(screen.getByLabelText('9 unread messages')).toHaveTextContent('9')
})

it('does not show an unread badge when the cached total is zero', () => {
  const client = new QueryClient()
  client.setQueryData(key, {items: [{unreadCount: 0}], cursor: null})
  client.setQueryData(aiKey, {status: 'ok', data: {items: [{unreadCount: 0}], nextCursor: null}})
  render(<CurrentAccountProvider initialAccount={account}><QueryClientProvider client={client}><AppQueryContext.Provider value><MobileUnreadBadge locale="en"/></AppQueryContext.Provider></QueryClientProvider></CurrentAccountProvider>)
  expect(screen.queryByLabelText(/unread messages/)).toBeNull()
})
