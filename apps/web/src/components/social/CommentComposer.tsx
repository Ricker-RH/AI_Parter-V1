'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {PublicCommentSchema, type Account, type PublicComment} from '@aifans/contracts'
import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialLabels} from './types'
import {authHref} from '../../lib/auth/return-to'

type Labels=Pick<SocialLabels,'commentPlaceholder'|'commentSubmit'|'commentSending'|'commentSuccess'|'interactionError'|'signInToComment'>
export type CommentViewer = Pick<Account, 'displayName' | 'avatarUrl'>

export function CommentComposer({postId,parentCommentId,authenticated,locale,labels,returnTo,onCommentCreated,onFeedbackChange,viewer,viewerScope}: {postId:string;parentCommentId?:string;authenticated:boolean;locale:Locale;labels:Labels;returnTo?:string;onCommentCreated?(comment:PublicComment):void;onFeedbackChange?(visible:boolean):void;viewer?:CommentViewer;viewerScope?:string}) {
  if (authenticated && !viewerScope) throw new Error('viewerScope is required for authenticated comment mutations')
  const safeReturnTo = returnTo ?? `/${locale}/posts/${postId}`
  const variant = parentCommentId ? 'reply' : 'primary'
  if (!authenticated) return <p className={`comment-signin comment-signin--${variant}`}><Link href={authHref(locale, safeReturnTo)}>{labels.signInToComment}</Link></p>
  const scope = JSON.stringify([postId, viewerScope, viewer?.displayName ?? null, viewer?.avatarUrl ?? null])
  return <ScopedCommentComposer key={scope} labels={labels} locale={locale} postId={postId} viewerScope={viewerScope!} {...(onCommentCreated ? {onCommentCreated} : {})} {...(onFeedbackChange ? {onFeedbackChange} : {})} {...(parentCommentId ? {parentCommentId} : {})} {...(viewer ? {viewer} : {})}/>
}

function ViewerAvatar({viewer}: {viewer?: CommentViewer}) {
  const [failed, setFailed] = useState(false)
  const initial = Array.from(viewer?.displayName.trim() ?? '')[0]?.toLocaleUpperCase()
  if (viewer?.avatarUrl && !failed) return <span className="comment-composer-avatar"><img alt={viewer.displayName} onError={() => setFailed(true)} src={viewer.avatarUrl}/></span>
  if (initial) return <span aria-label={viewer?.displayName} className="comment-composer-avatar" role="img">{initial}</span>
  return <span aria-hidden="true" className="comment-composer-avatar"><svg fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6"/><path d="M4.8 20c.8-4 3.2-6 7.2-6s6.4 2 7.2 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6"/></svg></span>
}

function SendIcon() {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M12 18V6m0 0-5 5m5-5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
}

function ScopedCommentComposer({postId,parentCommentId,locale,labels,onCommentCreated,onFeedbackChange,viewer,viewerScope}: {postId:string;parentCommentId?:string;locale:Locale;labels:Labels;onCommentCreated?(comment:PublicComment):void;onFeedbackChange?(visible:boolean):void;viewer?:CommentViewer;viewerScope:string}) {
  const router=useRouter()
  const [body,setBody]=useState('')
  const [pending,setPending]=useState(false)
  const [status,setStatus]=useState<'idle'|'success'|'error'>('idle')
  const inputRef=useRef<HTMLTextAreaElement>(null)
  const mutationId=useRef(0)
  const controller=useRef<AbortController|null>(null)
  useEffect(()=>()=>{mutationId.current+=1;controller.current?.abort()},[])
  useEffect(()=>()=>onFeedbackChange?.(false),[onFeedbackChange])
  useEffect(()=>{onFeedbackChange?.(status!=='idle')},[onFeedbackChange,status])
  useEffect(()=>{if(status==='success'&&!pending)inputRef.current?.focus()},[pending,status])
  useEffect(()=>{if(parentCommentId&&!pending)inputRef.current?.focus()},[parentCommentId,pending])
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
  const textarea = <textarea aria-label={labels.commentPlaceholder} disabled={pending} maxLength={2000} onChange={(event)=>{setBody(event.target.value);if(status!=='idle')setStatus('idle')}} placeholder={labels.commentPlaceholder} ref={inputRef} required rows={1} value={body} />
  const feedback = <span aria-live="polite" className="interaction-error">{status==='success'?labels.commentSuccess:status==='error'?labels.interactionError:''}</span>
  return <form className="comment-composer comment-composer--primary" onSubmit={(event)=>void submit(event)}>
    <ViewerAvatar {...(viewer ? {viewer} : {})}/>
    <div className="comment-composer-field">{textarea}<button aria-busy={pending} aria-label={labels.commentSubmit} className="comment-submit" disabled={pending||!body.trim()} title={pending?labels.commentSending:labels.commentSubmit} type="submit"><span className="comment-submit-visual"><SendIcon/></span></button></div>
    {feedback}
  </form>
}
