import {HumanInboxPageSchema, type HumanInboxPage} from '@aifans/contracts'
import {queryOptions} from '@tanstack/react-query'
import {humanRequest} from '../../lib/human-chat-client'
import {QueryLoadError, rethrowQueryLoadError} from '../../lib/query-load-error'

export type HumanInboxResult = {items: HumanInboxPage['items']; cursor: string | null}

async function loadHumanInbox(signal?: AbortSignal): Promise<HumanInboxResult> {
  const request = signal ?? new AbortController().signal
  try {
    const page = HumanInboxPageSchema.safeParse(await humanRequest('conversations?limit=100', request))
    if (!page.success) throw new QueryLoadError('unavailable')
    return {items: page.data.items, cursor: page.data.nextCursor}
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') throw new QueryLoadError('auth-required')
    return rethrowQueryLoadError(error, signal)
  }
}

export function humanInboxQueryOptions(profileId: string) {
  // Keep this first-page read separate from the workspace's merged inbox key.
  // The latter can contain older pages and realtime reconciliation state.
  return queryOptions({queryKey:['human-chat', profileId, 'inbox-page', null] as const, queryFn:({signal}) => loadHumanInbox(signal), staleTime:30_000, retry:false})
}
