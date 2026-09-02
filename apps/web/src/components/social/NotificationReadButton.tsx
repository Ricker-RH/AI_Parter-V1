'use client'

import {useRouter} from 'next/navigation'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'

function validReadResponse(value: unknown): value is {readAt: string} {
  if(typeof value!=='object'||value===null)return false
  const entries=Object.entries(value)
  const readAt=entries.length===1&&entries[0]?.[0]==='readAt'&&typeof entries[0][1]==='string'?entries[0][1]:null
  return readAt!==null&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(readAt)&&!Number.isNaN(Date.parse(readAt))
}

export function NotificationReadButton({notificationId,label,pendingLabel,errorLabel,locale,onRead,viewerScope}: {notificationId:string;label:string;pendingLabel:string;errorLabel:string;locale:Locale;onRead?(readAt:string):void;viewerScope:string}) {
  const scope=JSON.stringify([notificationId,viewerScope])
  return <ScopedNotificationReadButton key={scope} errorLabel={errorLabel} label={label} locale={locale} notificationId={notificationId} pendingLabel={pendingLabel} {...(onRead ? {onRead} : {})}/>
}

function ScopedNotificationReadButton({notificationId,label,pendingLabel,errorLabel,locale,onRead}: {notificationId:string;label:string;pendingLabel:string;errorLabel:string;locale:Locale;onRead?(readAt:string):void}) {
  const router=useRouter();const [pending,setPending]=useState(false);const [read,setRead]=useState(false);const [error,setError]=useState(false);const mutationId=useRef(0);const controller=useRef<AbortController|null>(null)
  useEffect(()=>()=>{mutationId.current+=1;controller.current?.abort()},[])
  async function markRead() {if(pending||read)return;const requestId=++mutationId.current;const requestController=new AbortController();controller.current=requestController;const isCurrent=()=>!requestController.signal.aborted&&requestId===mutationId.current;setRead(true);setPending(true);setError(false);try { const response=await fetch(`/api/social/notifications/${notificationId}/read`,{method:'PUT',credentials:'include',signal:requestController.signal});if(!isCurrent())return;if(response.status===401){setRead(false);globalThis.location.assign(authHref(locale,`${globalThis.location.pathname}${globalThis.location.search}`));return}const body:unknown=await response.json();if(!response.ok||!validReadResponse(body))throw new Error('read failed');onRead?.(body.readAt) } catch {if(isCurrent()){setRead(false);setError(true)}} finally {if(isCurrent()){controller.current=null;setPending(false)}} }
  return <>{read?null:<button aria-busy={pending} className="notification-read" disabled={pending} onClick={()=>void markRead()} type="button">{pending?pendingLabel:label}</button>}<span aria-live="polite" className="interaction-error">{pending?pendingLabel:error?errorLabel:''}</span></>
}
