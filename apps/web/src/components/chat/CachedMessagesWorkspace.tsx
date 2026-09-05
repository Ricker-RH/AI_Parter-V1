'use client'

import type {ChatConversationSummary} from '@aifans/contracts'
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
import {aiInboxQueryOptions, type AiInboxResult} from './ai-inbox-query'
import {QueryLoadError} from '../../lib/query-load-error'

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
    ...aiInboxQueryOptions(scope,locale,initialCursor),
    enabled:status==='authenticated'&&Boolean(account),
  })
  const authRequired=inbox.error instanceof QueryLoadError&&inbox.error.status==='auth-required'

  useEffect(()=>{
    if((status!=='anonymous'&&!authRequired)||redirected.current)return
    redirected.current=true
    router.replace(authHref(locale,returnTo))
  },[authRequired,locale,returnTo,router,status])

  if(status==='loading')return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/><p className={styles.detailNotice} role="status">{labels.loadingMore}</p></aside>}/>
  if(status==='unavailable'||status==='anonymous'||!account)return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/><p className={styles.detailNotice} role="alert">{labels.unavailable}</p></aside>}/>

  const result=inbox.data
  if(account.kind!=='human'&&inbox.isPending&&!result)return <InboxWorkspaceFrame list={<aside className={styles.listPane}><MessagesSectionHeader active="chat" labels={labels} locale={locale}/><p className={styles.detailNotice} role="status">{labels.loadingMore}</p></aside>}/>
  return <MessagesWorkspace initialCursor={initialCursor} items={result?.status==='ok'?result.data.items:[]} labels={labels} listUnavailable={!result&&inbox.isError&&!authRequired} locale={locale} nextCursor={result?.status==='ok'?result.data.nextCursor:null} onIpConversationRead={onIpConversationRead} selectedHumanId={selectedHumanId} snapshotViewerId={account.id} snapshotViewerStatus="authenticated"/>
}
