import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, render, screen} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn(),refresh:vi.fn()}),usePathname:()=>'/en/messages',useSearchParams:()=>new URLSearchParams()}))
import {AppQueryContext} from '../AppQueryProvider.js'
import {humanInboxQueryOptions} from './human-inbox-query.js'
import {HumanMessagesWorkspace} from './HumanMessagesWorkspace.js'

const self='11111111-1111-4111-8111-111111111111'
const labels={title:'Messages',chatTab:'Chats',notificationsTab:'Notifications',noConversations:'None',emptyDescription:'',emptyAction:'Explore',searchLabel:'Search',searchPlaceholder:'Search',noSearchResults:'None',partialSearchResults:'',loadMore:'More',loadingMore:'Loading',loadMoreError:'Failed',unavailableDescription:'Unavailable',unavailableAction:'Retry',unavailablePending:'Retrying',selectConversation:'Select',back:'Back',emptyHistory:'Empty',loadEarlierMessages:'Earlier',messagePlaceholder:'Write',send:'Send',sending:'Sending',messageFailed:'Failed',retry:'Retry',providerUnavailable:'Unavailable',invalidResponse:'Invalid',unavailable:'Unavailable'}
const peer='22222222-2222-4222-8222-222222222222'
const conversation={v:1,id:'33333333-3333-4333-8333-333333333333',createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z',participants:[{kind:'HUMAN',id:self,displayName:'Me',username:'myself',avatarUrl:null},{kind:'HUMAN',id:peer,displayName:'Alice',username:'alice',avatarUrl:null}]}

afterEach(()=>vi.unstubAllGlobals())

it('joins an in-flight warm human inbox read instead of starting a second first-page request', async () => {
  let resolveWarmup!: (response: Response) => void
  const fetch=vi.fn((input: RequestInfo | URL) => String(input).includes('/api/human-chat/conversations') ? new Promise<Response>(resolve=>{resolveWarmup=resolve}) : Promise.resolve(Response.json({items:[]})))
  vi.stubGlobal('fetch',fetch)
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  void client.fetchQuery(humanInboxQueryOptions(self)).catch(()=>undefined)

  render(<QueryClientProvider client={client}><AppQueryContext.Provider value><HumanMessagesWorkspace selfProfileId={self} items={[]} labels={labels} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)

  await new Promise(resolve=>setTimeout(resolve,0))
  expect(fetch.mock.calls.filter(([input])=>String(input).includes('/api/human-chat/conversations'))).toHaveLength(1)
  await act(async()=>resolveWarmup(Response.json({items:[{conversation,latestMessage:null,unreadCount:0,lastReadSequence:0}],nextCursor:null})))
  expect(await screen.findByRole('link',{name:/Alice/})).toBeVisible()
  await client.cancelQueries()
})

it('treats a completed empty warm inbox as ready instead of leaving the list loading', () => {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  client.setQueryData(humanInboxQueryOptions(self).queryKey,{items:[],cursor:null})
  render(<QueryClientProvider client={client}><AppQueryContext.Provider value><HumanMessagesWorkspace selfProfileId={self} items={[]} labels={labels} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
  expect(screen.queryByRole('status',{name:'Loading'})).toBeNull()
  expect(screen.queryByText('Loading')).toBeNull()
})

it('keeps an authoritative merged inbox cursor even when an older warm page has another cursor', () => {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  client.setQueryData(['human-chat',self,'inbox'],{items:[],cursor:null})
  client.setQueryData(humanInboxQueryOptions(self).queryKey,{items:[],cursor:'older-warm-cursor'})
  render(<QueryClientProvider client={client}><AppQueryContext.Provider value><HumanMessagesWorkspace selfProfileId={self} items={[]} labels={labels} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
  expect(screen.queryByRole('button',{name:'More'})).toBeNull()
})
