import {ChatConversationPageSchema, type ChatConversationPage} from '@aifans/contracts'
import {queryOptions} from '@tanstack/react-query'
import type {Locale} from '../../i18n/config'
import {QueryLoadError, rethrowQueryLoadError} from '../../lib/query-load-error'

export type AiInboxResult={status:'ok';data:ChatConversationPage}

async function loadAiInbox(cursor?:string,signal?:AbortSignal):Promise<AiInboxResult>{
  const query=cursor?`?${new URLSearchParams({cursor})}`:''
  try{
    const response=await fetch(`/api/conversations${query}`,{cache:'no-store',credentials:'same-origin',...(signal?{signal}:{})})
    if(!response.ok){await response.body?.cancel();throw new QueryLoadError(response.status===401?'auth-required':'unavailable')}
    const parsed=ChatConversationPageSchema.safeParse(await response.json())
    if(!parsed.success)throw new QueryLoadError('unavailable')
    return {status:'ok',data:parsed.data}
  }catch(error){return rethrowQueryLoadError(error,signal)}
}

export function aiInboxQueryOptions(scope:string,locale:Locale,cursor?:string){
  return queryOptions({queryKey:['ai-chat',scope,locale,'inbox',cursor??null] as const,queryFn:({signal})=>loadAiInbox(cursor,signal),staleTime:30_000,retry:false})
}
