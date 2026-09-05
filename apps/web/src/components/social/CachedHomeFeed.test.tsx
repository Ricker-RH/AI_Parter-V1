import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import type {ReactNode} from 'react'
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))

import {AppQueryContext} from '../AppQueryProvider.js'
import {CachedHomeFeed} from './CachedHomeFeed.js'

const labels={homeEmptyTitle:'Nothing here yet',homeEmptyDescription:'Try again later',loadMore:'Load more'} as never
const initial={status:'ok' as const,data:{items:[],nextCursor:null}}

function shared(client:QueryClient, children:ReactNode){return <QueryClientProvider client={client}><AppQueryContext.Provider value>{children}</AppQueryContext.Provider></QueryClientProvider>}

describe('CachedHomeFeed',()=>{
  it('retains the visible feed when refresh fails',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const refresh=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})))
    render(shared(client,<CachedHomeFeed canMutate={false} initialResult={initial} kind="for_you" labels={labels} locale="en" onRefreshReady={refresh} returnTo="/en"/>))
    await waitFor(()=>expect(refresh).toHaveBeenCalled());await refresh.mock.calls.at(-1)?.[0]()
    expect(client.getQueryData(['home-feed','public','en','for_you',null])).toEqual(initial)
    expect(screen.getByText('Nothing here yet')).toBeVisible();vi.unstubAllGlobals()
  })

  it('keeps a cached feed visible when the home route remounts',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const fetcher=vi.fn()
    vi.stubGlobal('fetch',fetcher)
    const first=render(shared(client,<CachedHomeFeed canMutate={false} initialResult={initial} kind="for_you" labels={labels} locale="en" returnTo="/en"/>))
    expect(screen.getByText('Nothing here yet')).toBeVisible()
    first.unmount()
    render(shared(client,<CachedHomeFeed canMutate={false} initialResult={{status:'unavailable'}} kind="for_you" labels={labels} locale="en" returnTo="/en"/>))
    expect(screen.getByText('Nothing here yet')).toBeVisible()
    expect(fetcher).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('keeps each feed cached when switching back to For You',()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const forYou={status:'ok' as const,data:{items:[],nextCursor:null}}
    const following={status:'unavailable' as const}
    const first=render(shared(client,<CachedHomeFeed canMutate={false} initialResult={forYou} kind="for_you" labels={labels} locale="en" returnTo="/en"/>))
    expect(screen.getByText('Nothing here yet')).toBeVisible()
    first.unmount()
    const second=render(shared(client,<CachedHomeFeed canMutate={false} initialResult={following} kind="following" labels={labels} locale="en" returnTo="/en?feed=following"/>))
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
    second.unmount()
    render(shared(client,<CachedHomeFeed canMutate={false} initialResult={{status:'unavailable'}} kind="for_you" labels={labels} locale="en" returnTo="/en"/>))
    expect(screen.getByText('Nothing here yet')).toBeVisible()
  })

  it('exposes an explicit refresh that revalidates the active feed', async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const refresh=vi.fn()
    const fetcher=vi.fn(async()=>Response.json({items:[],nextCursor:null}))
    vi.stubGlobal('fetch',fetcher)
    render(shared(client,<CachedHomeFeed canMutate={false} initialResult={initial} kind="for_you" labels={labels} locale="en" onRefreshReady={refresh} returnTo="/en"/>))
    await waitFor(()=>expect(refresh).toHaveBeenCalled())
    await refresh.mock.calls.at(-1)?.[0]()
    expect(fetcher).toHaveBeenCalledWith('/api/feed?kind=for_you&locale=en', expect.any(Object))
    vi.unstubAllGlobals()
  })

  it('does not reuse a personalized feed for another viewer scope',()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const first=render(shared(client,<CachedHomeFeed canMutate initialResult={initial} kind="for_you" labels={labels} locale="en" returnTo="/en" viewerScope="viewer-a"/>))
    expect(screen.getByText('Nothing here yet')).toBeVisible()
    first.unmount()
    render(shared(client,<CachedHomeFeed canMutate initialResult={{status:'unavailable'}} kind="for_you" labels={labels} locale="en" returnTo="/en" viewerScope="viewer-b"/>))
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
  })
})
