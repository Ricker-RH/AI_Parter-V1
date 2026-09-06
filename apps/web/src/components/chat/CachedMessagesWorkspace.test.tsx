import {ChatConversationPageSchema} from '@aifans/contracts'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {AppQueryContext} from '../AppQueryProvider.js'
import {CachedMessagesWorkspace} from './CachedMessagesWorkspace.js'

const account={id:'11111111-1111-4111-8111-111111111111',kind:'human' as const}
const conversation=ChatConversationPageSchema.parse({items:[{id:'22222222-2222-4222-8222-222222222222',ipProfile:{id:'33333333-3333-4333-8333-333333333333',displayName:'Luma',username:'luma'},lastMessage:null,updatedAt:'2026-09-01T00:00:00.000Z',sendEnabled:true}],nextCursor:null})
const labels={title:'Messages',chatTab:'Chats',notificationsTab:'Notifications',noConversations:'None',emptyDescription:'',emptyAction:'',searchLabel:'',searchPlaceholder:'',noSearchResults:'',partialSearchResults:'',loadMore:'',loadingMore:'Loading',loadMoreError:'',unavailableDescription:'',unavailableAction:'Retry',unavailablePending:'Retrying',selectConversation:'Select',back:'Back',emptyHistory:'',loadEarlierMessages:'',messagePlaceholder:'',send:'',sending:'',messageFailed:'',retry:'',providerUnavailable:'',invalidResponse:'',unavailable:'Unavailable'}

vi.mock('../account/CurrentAccountProvider.js',()=>({useCurrentAccount:()=>({account,status:'authenticated'})}))
const replace=vi.hoisted(()=>vi.fn())
vi.mock('next/navigation',()=>({useRouter:()=>({replace})}))
vi.mock('./MessagesWorkspace.js',()=>({MessagesWorkspace:({items,listUnavailable}:{items:typeof conversation.items;listUnavailable:boolean})=><div>{listUnavailable?<p role="alert">Unavailable</p>:null}{items.map((item)=><span key={item.id}>{item.ipProfile.displayName}</span>)}</div>}))

afterEach(()=>vi.unstubAllGlobals())

describe('CachedMessagesWorkspace',()=>{
  it('redirects an expired inbox session to the same sign-in destination',async()=>{
    replace.mockClear();vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:401})))
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    render(<QueryClientProvider client={client}><CachedMessagesWorkspace labels={labels} locale="en"/></QueryClientProvider>)
    await waitFor(()=>expect(replace).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fmessages'))
  })

  it('reports an unavailable first inbox load to the workspace',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})))
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    render(<QueryClientProvider client={client}><CachedMessagesWorkspace labels={labels} locale="en"/></QueryClientProvider>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable')
  })

  it('keeps the inbox snapshot visible after a failed refetch',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const key=['ai-chat',`${account.kind}:${account.id}`,'en','inbox',null]
    client.setQueryData(key,{status:'ok',data:conversation})
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})))
    render(<QueryClientProvider client={client}><CachedMessagesWorkspace labels={labels} locale="en"/></QueryClientProvider>)
    await act(async()=>{await client.invalidateQueries({queryKey:key})})
    expect(client.getQueryData(key)).toEqual({status:'ok',data:conversation})
    expect(screen.getByText('Luma')).toBeVisible()
  })

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

  it('caches a newly created empty IP conversation without showing it in the inbox',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const key=['ai-chat',`${account.kind}:${account.id}`,'en','inbox',null]
    client.setQueryData(key,{status:'ok',data:{items:[],nextCursor:null}})
    vi.stubGlobal('fetch',vi.fn())
    render(<QueryClientProvider client={client}><AppQueryContext.Provider value><CachedMessagesWorkspace labels={labels} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
    window.dispatchEvent(new CustomEvent('aifans:ip-conversation-created',{detail:conversation.items[0]!}))
    await waitFor(()=>expect((client.getQueryData(key) as {status:'ok';data:{items:{id:string}[]}}).data.items[0]?.id).toBe(conversation.items[0]!.id))
  })

  it('shows an IP conversation in the inbox as soon as its first message is sent',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const key=['ai-chat',`${account.kind}:${account.id}`,'en','inbox',null]
    client.setQueryData(key,{status:'ok',data:{items:[],nextCursor:null}})
    vi.stubGlobal('fetch',vi.fn())
    render(<QueryClientProvider client={client}><AppQueryContext.Provider value><CachedMessagesWorkspace labels={labels} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
    window.dispatchEvent(new CustomEvent('aifans:ip-conversation-activity',{detail:{...conversation.items[0]!,lastMessage:{role:'human',body:'Hello Luma',createdAt:'2026-09-01T00:01:00.000Z'},updatedAt:'2026-09-01T00:01:00.000Z'}}))
    expect(await screen.findByText('Luma')).toBeVisible()
  })
})
