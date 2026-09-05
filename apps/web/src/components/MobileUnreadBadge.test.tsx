import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen, waitFor} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {CurrentAccountProvider} from './account/CurrentAccountProvider.js'
import {AppQueryContext} from './AppQueryProvider.js'
import {MobileUnreadBadge} from './MobileUnreadBadge.js'
import {humanInboxQueryOptions} from './chat/human-inbox-query.js'
import type {HumanInboxResult} from './chat/human-inbox-query.js'
import {aiInboxQueryOptions} from './chat/ai-inbox-query.js'

const account = {id: '11111111-1111-4111-8111-111111111111', kind: 'human' as const, username: 'rui', displayName: 'Rui', avatarUrl: null, preferredLocale: 'en' as const, creatorModeEnabled: false, profileVersion: 1, background: {type: 'color' as const, colorKey: 'paper' as const}}
const key = ['human-chat', account.id, 'inbox']
const aiKey = ['ai-chat', `human:${account.id}`, 'en', 'inbox', null]
const warmConversation:HumanInboxResult['items'][number]['conversation']={v:1,id:'22222222-2222-4222-8222-222222222222',createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z',participants:[{kind:'HUMAN',id:account.id,displayName:'Rui',username:'rui',avatarUrl:null},{kind:'HUMAN',id:'33333333-3333-4333-8333-333333333333',displayName:'Alice',username:'alice',avatarUrl:null}]}

afterEach(()=>vi.unstubAllGlobals())

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

it('uses a warmed human first page until the workspace has built its merged inbox cache', () => {
  const client = new QueryClient()
  client.setQueryData(humanInboxQueryOptions(account.id).queryKey, {items: [{conversation:warmConversation,latestMessage:null,unreadCount:2,lastReadSequence:0}], cursor: null})
  client.setQueryData(aiKey, {status: 'ok', data: {items: [{unreadCount: 4}], nextCursor: null}})
  render(<CurrentAccountProvider initialAccount={account}><QueryClientProvider client={client}><AppQueryContext.Provider value><MobileUnreadBadge locale="en"/></AppQueryContext.Provider></QueryClientProvider></CurrentAccountProvider>)
  expect(screen.getByLabelText('6 unread messages')).toHaveTextContent('6')
})

it('reuses in-flight inbox reads instead of issuing parallel badge requests', async () => {
  const fetch=vi.fn(()=>new Promise<Response>(()=>undefined))
  vi.stubGlobal('fetch',fetch)
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
  void client.fetchQuery(humanInboxQueryOptions(account.id)).catch(()=>undefined)
  void client.fetchQuery(aiInboxQueryOptions(`human:${account.id}`,'en')).catch(()=>undefined)
  render(<CurrentAccountProvider initialAccount={account}><QueryClientProvider client={client}><AppQueryContext.Provider value><MobileUnreadBadge locale="en"/></AppQueryContext.Provider></QueryClientProvider></CurrentAccountProvider>)
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2))
  await client.cancelQueries()
})
