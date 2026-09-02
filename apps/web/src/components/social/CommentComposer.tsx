'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {PublicCommentSchema, type PublicComment} from '@aifans/contracts'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialLabels} from './types'
import {authHref} from '../../lib/auth/return-to'

type Labels=Pick<SocialLabels,'commentPlaceholder'|'commentSubmit'|'commentSending'|'commentSuccess'|'interactionError'|'signInToComment'>

export function CommentComposer({postId,parentCommentId,authenticated,locale,labels,returnTo,onCommentCreated,viewerScope}: {postId:string;parentCommentId?:string;authenticated:boolean;locale:Locale;labels:Labels;returnTo?:string;onCommentCreated?(comment:PublicComment):void;viewerScope?:string}) {
  if (authenticated && !viewerScope) throw new Error('viewerScope is required for authenticated comment mutations')
  const safeReturnTo = returnTo ?? `/${locale}/posts/${postId}`
  const variant = parentCommentId ? 'reply' : 'primary'
  if (!authenticated) return <p className={`comment-signin comment-signin--${variant}`}><Link href={authHref(locale, safeReturnTo)}>{labels.signInToComment}</Link></p>
  const scope = JSON.stringify([postId, parentCommentId ?? null, viewerScope])
  return <ScopedCommentComposer key={scope} labels={labels} locale={locale} postId={postId} viewerScope={viewerScope!} {...(onCommentCreated ? {onCommentCreated} : {})} {...(parentCommentId ? {parentCommentId} : {})}/>
}

function ScopedCommentComposer({postId,parentCommentId,locale,labels,onCommentCreated,viewerScope}: {postId:string;parentCommentId?:string;locale:Locale;labels:Labels;onCommentCreated?(comment:PublicComment):void;viewerScope:string}) {
  const router=useRouter()
  const [body,setBody]=useState('')
  const [pending,setPending]=useState(false)
  const [status,setStatus]=useState<'idle'|'success'|'error'>('idle')
  const inputRef=useRef<HTMLTextAreaElement>(null)
  const mutationId=useRef(0)
  const controller=useRef<AbortController|null>(null)
  useEffect(()=>()=>{mutationId.current+=1;controller.current?.abort()},[])
  useEffect(()=>{if(status==='success'&&!pending)inputRef.current?.focus()},[pending,status])
  const variant = parentCommentId ? 'reply' : 'primary'
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if(pending)return
    const value=body.trim()
    if (!value || value.length>2000) { setStatus('error'); return }
    const requestedPostId=postId;const requestedParentCommentId=parentCommentId;const requestId=++mutationId.current;const requestController=new AbortController();controller.current=requestController;const isCurrent=()=>!requestController.signal.aborted&&mutationId.current===requestId
    setPending(true);setStatus('idle')
    try {
      const response=await fetch(`/api/social/posts/${requestedPostId}/comments`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({body:value,...(requestedParentCommentId?{parentCommentId:requestedParentCommentId}:{})}),signal:requestController.signal})
      if(!isCurrent())return
      if (response.status===401) { router.replace(authHref(locale, `${window.location.pathname}${window.location.search}`)); return }
      const parsed=response.ok?PublicCommentSchema.safeParse(await response.json() as unknown):null
      if (!parsed?.success||parsed.data.postId!==requestedPostId||parsed.data.parentCommentId!==(requestedParentCommentId??null)) throw new Error('comment failed')
      setBody('');onCommentCreated?.(parsed.data);setStatus('success')
    } catch { if(isCurrent())setStatus('error') } finally { if(isCurrent()){controller.current=null;setPending(false)} }
  }
  return <form className={`comment-composer comment-composer--${variant}`} onSubmit={(event)=>void submit(event)}>
    <textarea aria-label={labels.commentPlaceholder} disabled={pending} maxLength={2000} onChange={(event)=>setBody(event.target.value)} placeholder={labels.commentPlaceholder} ref={inputRef} required rows={1} value={body} />
    <button aria-busy={pending} disabled={pending||!body.trim()} type="submit">{pending?labels.commentSending:labels.commentSubmit}</button>
    <span aria-live="polite" className="interaction-error">{status==='success'?labels.commentSuccess:status==='error'?labels.interactionError:''}</span>
  </form>
}
