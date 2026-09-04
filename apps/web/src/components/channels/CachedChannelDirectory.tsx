'use client'
import {ChannelPageSchema} from '@aifans/contracts'
import {QueryClientProvider, useQuery} from '@tanstack/react-query'
import {useContext, useState} from 'react'
import {AppQueryContext, createAppQueryClient} from '../AppQueryProvider'
import type {Locale} from '../../i18n/config'
import {ChannelDirectory, type ChannelDirectoryLabels} from './ChannelDirectory'

async function load(query: string, cursor?: string) {
  const params = new URLSearchParams(query ? {q: query} : {})
  if (cursor) params.set('cursor', cursor)
  const response = await fetch(`/api/channels${params.size ? `?${params}` : ''}`, {credentials: 'same-origin'})
  const body: unknown = await response.json()
  const parsed = ChannelPageSchema.safeParse(body)
  return response.ok && parsed.success ? {status: 'ok' as const, data: parsed.data} : {status: 'unavailable' as const}
}
function Directory({labels, locale, query, cursor}: {labels: ChannelDirectoryLabels; locale: Locale; query: string; cursor?: string}) {
  const result = useQuery({queryKey: ['channels', locale, query, cursor ?? null], queryFn: () => load(query, cursor), staleTime: 30_000})
  if (!result.data) return <div aria-busy="true" className="route-skeleton route-skeleton--feed" role="status"/>
  return <ChannelDirectory labels={labels} locale={locale} query={query} result={result.data}/>
}
export function CachedChannelDirectory(props: {labels: ChannelDirectoryLabels; locale: Locale; query: string; cursor?: string}) {
  const shared = useContext(AppQueryContext)
  const [client] = useState(createAppQueryClient)
  return shared ? <Directory {...props}/> : <QueryClientProvider client={client}><Directory {...props}/></QueryClientProvider>
}
