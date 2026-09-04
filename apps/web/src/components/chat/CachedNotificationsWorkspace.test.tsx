import {NotificationPageSchema} from '@aifans/contracts'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {AppQueryContext} from '../AppQueryProvider.js'
import {CachedNotificationsWorkspace} from './CachedNotificationsWorkspace.js'

const account={id:'11111111-1111-4111-8111-111111111111',kind:'human' as const}
const notifications=NotificationPageSchema.parse({items:[{id:'22222222-2222-4222-8222-222222222222',kind:'post_like',actor:null,postId:'33333333-3333-4333-8333-333333333333',commentId:null,createdAt:'2026-09-01T00:00:00.000Z',readAt:null}],nextCursor:null})

vi.mock('../account/CurrentAccountProvider.js',()=>({useCurrentAccount:()=>({account,status:'authenticated'})}))
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()})}))
vi.mock('./NotificationsWorkspace.js',()=>({NotificationsWorkspace:({result}:{result:{status:string;data?:typeof notifications}})=><div>{result.status==='ok'?result.data?.items[0]?.id:'Unavailable'}</div>}))

afterEach(()=>vi.unstubAllGlobals())

describe('CachedNotificationsWorkspace',()=>{
  it('shows an account-scoped notification snapshot immediately when its route remounts',()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    client.setQueryData(['notifications',`${account.kind}:${account.id}`,'en','list',null],{status:'ok',data:notifications})
    const request=vi.fn()
    vi.stubGlobal('fetch',request)

    const first=render(<QueryClientProvider client={client}><AppQueryContext.Provider value><CachedNotificationsWorkspace labels={{} as never} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
    expect(screen.getByText(notifications.items[0]!.id)).toBeVisible()
    expect(request).not.toHaveBeenCalled()

    first.unmount()
    render(<QueryClientProvider client={client}><AppQueryContext.Provider value><CachedNotificationsWorkspace labels={{} as never} locale="en"/></AppQueryContext.Provider></QueryClientProvider>)
    expect(screen.getByText(notifications.items[0]!.id)).toBeVisible()
    expect(request).not.toHaveBeenCalled()
  })
})
