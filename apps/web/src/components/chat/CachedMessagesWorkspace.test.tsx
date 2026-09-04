import {ChatConversationPageSchema} from '@aifans/contracts'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {AppQueryContext} from '../AppQueryProvider.js'
import {CachedMessagesWorkspace} from './CachedMessagesWorkspace.js'

const account={id:'11111111-1111-4111-8111-111111111111',kind:'human' as const}
const conversation=ChatConversationPageSchema.parse({items:[{id:'22222222-2222-4222-8222-222222222222',ipProfile:{id:'33333333-3333-4333-8333-333333333333',displayName:'Luma',username:'luma'},lastMessage:null,updatedAt:'2026-09-01T00:00:00.000Z',sendEnabled:true}],nextCursor:null})
const labels={title:'Messages',chatTab:'Chats',notificationsTab:'Notifications',noConversations:'None',emptyDescription:'',emptyAction:'',searchLabel:'',searchPlaceholder:'',noSearchResults:'',partialSearchResults:'',loadMore:'',loadingMore:'Loading',loadMoreError:'',unavailableDescription:'',unavailableAction:'Retry',unavailablePending:'Retrying',selectConversation:'Select',back:'Back',emptyHistory:'',loadEarlierMessages:'',messagePlaceholder:'',send:'',sending:'',messageFailed:'',retry:'',providerUnavailable:'',invalidResponse:'',unavailable:'Unavailable'}

vi.mock('../account/CurrentAccountProvider.js',()=>({useCurrentAccount:()=>({account,status:'authenticated'})}))
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()})}))
vi.mock('./MessagesWorkspace.js',()=>({MessagesWorkspace:({items}:{items:typeof conversation.items})=><div>{items.map((item)=><span key={item.id}>{item.ipProfile.displayName}</span>)}</div>}))

afterEach(()=>vi.unstubAllGlobals())

describe('CachedMessagesWorkspace',()=>{
  it('shows an account-scoped AI inbox snapshot immediately for a human account without refetching it',()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    client.setQueryData(['ai-chat',`${account.kind}:${account.id}`,'en','inbox',null],{status:'ok',data:conversation})
    const request=vi.fn()
    vi.stubGlobal('fetch',request)

    const first=render(<QueryClientProvider client={client}><AppQueryContext.Provider value><CachedMessagesWorkspace labels={labels} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
    expect(screen.getByText('Luma')).toBeVisible()
    expect(request).not.toHaveBeenCalled()

    first.unmount()
    render(<QueryClientProvider client={client}><AppQueryContext.Provider value><CachedMessagesWorkspace labels={labels} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
    expect(screen.getByText('Luma')).toBeVisible()
    expect(request).not.toHaveBeenCalled()
  })
})
