'use client'

import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {useContext, useEffect, useState, type ReactNode} from 'react'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'

export function HumanChatQueryProvider({children, client: providedClient, profileId}: {children: ReactNode; client?: QueryClient; profileId?: string}) {
  const [ownedClient] = useState(() => new QueryClient({defaultOptions: {queries: {gcTime: 10 * 60_000, refetchOnWindowFocus: false, staleTime: 30_000}}}))
  const client = providedClient ?? ownedClient
  const appQueryActive = useContext(AppQueryContext)
  useEffect(() => () => {
    if (!appQueryActive && profileId) client.removeQueries({queryKey: ['human-chat', profileId]})
  }, [appQueryActive, client, profileId])
  if (appQueryActive && !providedClient) return <>{children}</>
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
