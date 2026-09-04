'use client'

import {ChatConversationPageSchema, type ChatConversationPage, type ChatConversationSummary} from '@aifans/contracts'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useCallback, useEffect, useRef} from 'react'
import {useRouter} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import {InboxWorkspaceFrame} from './InboxWorkspaceFrame'
import {MessagesSectionHeader} from './MessagesSectionHeader'
import {MessagesWorkspace, type MessagesLabels} from './MessagesWorkspace'
import styles from './MessagesWorkspace.module.css'

type AiInboxResult = {status:'ok';data:ChatConversationPage}|{status:'auth-required'}|{status:'unavailable'}

async function loadAiInbox(cursor?:string, signal?:AbortSignal):Promise<AiInboxResult>{
  const query=cursor?`?${new URLSearchParams({cursor})}`:''
  try{
    const response=await fetch(`/api/conversations${query}`,{cache:'no-store',credentials:'same-origin',...(signal?{signal}:{})})
    if(response.status===401){await response.body?.cancel();return {status:'auth-required'}}
    if(!response.ok){await response.body?.cancel();return {status:'unavailable'}}
    const body:unknown=await response.json()
    const parsed=ChatConversationPageSchema.safeParse(body)
    return parsed.success?{status:'ok',data:parsed.data}:{status:'unavailable'}
  }catch(error){
    if((error as Error).name==='AbortError')throw error
    return {status:'unavailable'}
  }
}

function messageReturnTo(locale:Locale, selectedHumanId?:string, cursor?:string){
  return `/${locale}/messages${selectedHumanId?`?${new URLSearchParams({humanConversation:selectedHumanId})}`:cursor?`?${new URLSearchParams({cursor})}`:''}`
}

export function CachedMessagesWorkspace({labels,locale,initialCursor,selectedHumanId}:{labels:MessagesLabels;locale:Locale;initialCursor?:string;selectedHumanId?:string}){
  const {account,status}=useCurrentAccount()
  const router=useRouter()
  const queryClient=useQueryClient()
  const redirected=useRef(false)
  const returnTo=messageReturnTo(locale,selectedHumanId,initialCursor)
  const scope=account?`${account.kind}:${account.id}`:'anonymous'
  const onIpConversationRead=useCallback((read:ChatConversationSummary)=>{
    queryClient.setQueriesData<AiInboxResult>({queryKey:['ai-chat',scope,locale,'inbox']},cached=>
      cached?.status==='ok'
        ? {...cached,data:{...cached.data,items:cached.data.items.map(item=>item.id===read.id?read:item)}}
        : cached,
    )
  },[locale,queryClient,scope])
  const inbox=useQuery({
    enabled:status==='authenticated'&&Boolean(account),
    queryKey:['ai-chat',scope,locale,'inbox',initialCursor??null],
    queryFn:({signal})=>loadAiInbox(initialCursor,signal),
    staleTime:30_000,
  })

  useEffect(()=>{
    if((status!=='anonymous'&&inbox.data?.status!=='auth-required')||redirected.current)return
    redirected.current=true
    router.replace(authHref(locale,returnTo))
  },[inbox.data?.status,locale,returnTo,router,status])

  if(status==='loading')return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/><p className={styles.detailNotice} role="status">{labels.loadingMore}</p></aside>}/>
  if(status==='unavailable'||status==='anonymous'||!account)return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/><p className={styles.detailNotice} role="alert">{labels.unavailable}</p></aside>}/>

  const result=inbox.data
  if(account.kind!=='human'&&inbox.isPending&&!result)return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/><p className={styles.detailNotice} role="status">{labels.loadingMore}</p></aside>}/>
  return <MessagesWorkspace initialCursor={initialCursor} items={result?.status==='ok'?result.data.items:[]} labels={labels} listUnavailable={result?.status==='unavailable'} locale={locale} nextCursor={result?.status==='ok'?result.data.nextCursor:null} onIpConversationRead={onIpConversationRead} selectedHumanId={selectedHumanId} snapshotViewerId={account.id} snapshotViewerStatus="authenticated"/>
}
