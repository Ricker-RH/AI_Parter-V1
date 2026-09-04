'use client'

import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {useEffect, useState, type ReactNode} from 'react'

export function HumanChatQueryProvider({children, client: providedClient, profileId}: {children: ReactNode; client?: QueryClient; profileId?: string}) {
  const [ownedClient] = useState(() => new QueryClient({defaultOptions: {queries: {gcTime: 10 * 60_000, refetchOnWindowFocus: false, staleTime: 30_000}}}))
  const client = providedClient ?? ownedClient
  useEffect(() => () => {
    if (profileId) client.removeQueries({queryKey: ['human-chat', profileId]})
  }, [client, profileId])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
