'use client'
import {HumanProfileSchema,type HumanProfile} from '@aifans/contracts'
import {useEffect,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {humanProfileLabels} from './human-profile-labels'
import styles from './HumanProfileActions.module.css'

export function HumanProfileActions({profile,locale,onProfileChange}:{profile:HumanProfile;locale:Locale;onProfileChange:(profile:HumanProfile)=>void}){
 const router=useRouter(),labels=humanProfileLabels(locale)
 const [pending,setPending]=useState(false),[error,setError]=useState(false),[confirm,setConfirm]=useState(false)
 const controller=useRef<AbortController|null>(null),busy=useRef(false)
 useEffect(()=>()=>controller.current?.abort(),[])
 const {relationship:r}=profile
 if(profile.isOwner)return null
 async function perform(action:'follow'|'block'|'chat'){
  if(busy.current)return
  busy.current=true;setPending(true);setError(false);setConfirm(false)
  const abort=new AbortController();controller.current=abort
  try{
   const response=await fetch(action==='chat'?'/api/human-chat/conversations':`/api/humans/${profile.identity.id}/${action}`,{method:action==='chat'?'POST':(action==='follow'?r.following:r.blockedByViewer)?'DELETE':'PUT',body:action==='chat'?JSON.stringify({peerProfileId:profile.identity.id}):'{}',headers:{'content-type':'application/json'},credentials:'same-origin',signal:abort.signal})
   if(abort.signal.aborted)return
   if(response.status===401){router.replace(authHref(locale,`/${locale}/humans/${profile.identity.id}`));return}
   if(!response.ok)throw Error()
   const body:unknown=await response.json()
   if(action==='chat'){
    const id=typeof body==='object'&&body!==null&&'conversation' in body&&typeof body.conversation==='object'&&body.conversation!==null&&'id' in body.conversation?body.conversation.id:null
    if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error()
    if(!abort.signal.aborted)router.push(`/${locale}/messages?humanConversation=${id}`)
   }else{
    if(typeof body!=='object'||body===null||Object.keys(body).length!==1||!('changed' in body)||typeof body.changed!=='boolean')throw Error()
    const refreshed=await fetch(`/api/humans/${profile.identity.id}`,{cache:'no-store',credentials:'same-origin',signal:abort.signal})
    if(!refreshed.ok)throw Error()
    const next=HumanProfileSchema.parse(await refreshed.json())
    if(next.identity.id!==profile.identity.id)throw Error()
    if(!abort.signal.aborted)onProfileChange(next)
   }
  }catch{if(!abort.signal.aborted)setError(true)}finally{if(!abort.signal.aborted){busy.current=false;setPending(false)}}
 }
 const reason=r.messageDisabledReason
 const disabledText=reason==='blocked'?labels.blocked:reason==='mutual_follow_required'?labels.mutual:reason==='authentication_required'?labels.auth:reason==='self'?labels.self:reason==='account_unavailable'?labels.accountUnavailable:null
 return <div className={styles.actions} aria-busy={pending}>
  <div className={styles.primaryActions}><button aria-pressed={r.following} disabled={pending||r.blockedByViewer} onClick={()=>void perform('follow')} type="button">{r.following?labels.following:r.followedBy?labels.followBack:labels.follow}</button><button aria-describedby={disabledText?'human-message-reason':undefined} disabled={pending||!r.canMessage} onClick={()=>void perform('chat')} type="button">{labels.chat}</button></div>
  {disabledText?<p id="human-message-reason">{disabledText}</p>:null}
  <button className={styles.block} disabled={pending} onClick={()=>r.blockedByViewer?void perform('block'):setConfirm(true)} type="button">{r.blockedByViewer?labels.unblock:labels.block}</button>
  {confirm?<div className={styles.confirm} role="group" aria-label={labels.confirmBlock}><p>{labels.blockExplanation}</p><button onClick={()=>void perform('block')} type="button">{labels.confirmBlock}</button><button onClick={()=>setConfirm(false)} type="button">{labels.cancel}</button></div>:null}
  {error?<p role="alert">{labels.error}</p>:null}
 </div>
}
