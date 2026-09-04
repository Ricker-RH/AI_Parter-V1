import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import type {ReactNode} from 'react'
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))

import {AppQueryContext} from '../AppQueryProvider.js'
import {CachedHomeFeed} from './CachedHomeFeed.js'

const labels={homeEmptyTitle:'Nothing here yet',homeEmptyDescription:'Try again later',loadMore:'Load more'} as never
const initial={status:'ok' as const,data:{items:[],nextCursor:null}}

function shared(client:QueryClient, children:ReactNode){return <QueryClientProvider client={client}><AppQueryContext.Provider value>{children}</AppQueryContext.Provider></QueryClientProvider>}

describe('CachedHomeFeed',()=>{
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

  it('does not reuse a personalized feed for another viewer scope',()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    const first=render(shared(client,<CachedHomeFeed canMutate initialResult={initial} kind="for_you" labels={labels} locale="en" returnTo="/en" viewerScope="viewer-a"/>))
    expect(screen.getByText('Nothing here yet')).toBeVisible()
    first.unmount()
    render(shared(client,<CachedHomeFeed canMutate initialResult={{status:'unavailable'}} kind="for_you" labels={labels} locale="en" returnTo="/en" viewerScope="viewer-b"/>))
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
  })
})
