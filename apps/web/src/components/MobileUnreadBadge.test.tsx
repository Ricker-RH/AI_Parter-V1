import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen} from '@testing-library/react'
import {expect, it} from 'vitest'
import {CurrentAccountProvider} from './account/CurrentAccountProvider.js'
import {AppQueryContext} from './AppQueryProvider.js'
import {MobileUnreadBadge} from './MobileUnreadBadge.js'

const account = {id: '11111111-1111-4111-8111-111111111111', kind: 'human' as const, username: 'rui', displayName: 'Rui', avatarUrl: null, preferredLocale: 'en' as const, creatorModeEnabled: false, profileVersion: 1, background: {type: 'color' as const, colorKey: 'paper' as const}}
const key = ['human-chat', account.id, 'inbox']

it('derives one total from the shared inbox cache', () => {
  const client = new QueryClient()
  client.setQueryData(key, {items: [{unreadCount: 2}, {unreadCount: 3}, {unreadCount: 0}], cursor: null})
  render(<CurrentAccountProvider initialAccount={account}><QueryClientProvider client={client}><AppQueryContext.Provider value><MobileUnreadBadge locale="en"/></AppQueryContext.Provider></QueryClientProvider></CurrentAccountProvider>)
  expect(screen.getByLabelText('5 unread messages')).toHaveTextContent('5')
})

it('does not show an unread badge when the cached total is zero', () => {
  const client = new QueryClient()
  client.setQueryData(key, {items: [{unreadCount: 0}], cursor: null})
  render(<CurrentAccountProvider initialAccount={account}><QueryClientProvider client={client}><AppQueryContext.Provider value><MobileUnreadBadge locale="en"/></AppQueryContext.Provider></QueryClientProvider></CurrentAccountProvider>)
  expect(screen.queryByLabelText(/unread messages/)).toBeNull()
})
