import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {AccountSchema} from '@aifans/contracts'
import {CurrentAccountProvider} from '../account/CurrentAccountProvider.js'
import {NavigationWarmup} from './NavigationWarmup.js'

let pathname = '/en'
vi.mock('next/navigation', () => ({usePathname: () => pathname, useSearchParams: () => new URLSearchParams()}))

const account = AccountSchema.parse({id:'11111111-1111-4111-8111-111111111111',kind:'human',username:'rui',displayName:'Rui',preferredLocale:'en',creatorModeEnabled:false})

afterEach(() => {
  vi.unstubAllGlobals()
  pathname = '/en'
})

describe('NavigationWarmup', () => {
  it('warms other first-page destinations after the entry route is ready without warming the current feed again', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => new Response(null, {status:503}))
    vi.stubGlobal('fetch', fetch)
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
    render(<CurrentAccountProvider initialAccount={account}><QueryClientProvider client={client}><NavigationWarmup locale="en"/></QueryClientProvider></CurrentAccountProvider>)

    document.dispatchEvent(new CustomEvent('aifans:route-ready', {detail:{route:'/en'}}))

    await waitFor(() => expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/conversations',
      '/api/human-chat/conversations?limit=100',
      '/api/creator/ips?limit=25',
    ]))
  })
})
