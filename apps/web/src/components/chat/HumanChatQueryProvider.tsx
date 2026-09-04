'use client'

import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {useEffect, useState, type ReactNode} from 'react'

type Props = {
  children: ReactNode
  client?: QueryClient
  profileId: string
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  })
}

export function HumanChatQueryProvider({children, client: providedClient, profileId}: Props) {
  const [ownedClient] = useState(createClient)
  const client = providedClient ?? ownedClient

  useEffect(() => () => {
    client.removeQueries({queryKey: ['human-chat', profileId]})
  }, [client, profileId])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
