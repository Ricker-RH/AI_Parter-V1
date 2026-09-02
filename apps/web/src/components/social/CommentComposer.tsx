'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useState} from 'react'
import type {Locale} from '../../i18n/config'
import type {SocialLabels} from './types'
import {authHref} from '../../lib/auth/return-to'

type Labels=Pick<SocialLabels,'commentPlaceholder'|'commentSubmit'|'commentSending'|'commentSuccess'|'interactionError'|'signInToComment'>

export function CommentComposer({postId,parentCommentId,authenticated,locale,labels,returnTo}: {postId:string;parentCommentId?:string;authenticated:boolean;locale:Locale;labels:Labels;returnTo?:string}) {
  const router=useRouter()
  const [body,setBody]=useState('')
  const [pending,setPending]=useState(false)
  const [status,setStatus]=useState<'idle'|'success'|'error'>('idle')
  const safeReturnTo = returnTo ?? `/${locale}/posts/${postId}`
  const variant = parentCommentId ? 'reply' : 'primary'
  if (!authenticated) return <p className={`comment-signin comment-signin--${variant}`}><Link href={authHref(locale, safeReturnTo)}>{labels.signInToComment}</Link></p>
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const value=body.trim()
    if (!value || value.length>2000) { setStatus('error'); return }
    setPending(true);setStatus('idle')
    try {
      const response=await fetch(`/api/social/posts/${postId}/comments`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({body:value,...(parentCommentId?{parentCommentId}:{})})})
      if (response.status===401) { router.replace(authHref(locale, `${window.location.pathname}${window.location.search}`)); return }
      if (!response.ok) throw new Error('comment failed')
      setBody('');setStatus('success');router.refresh()
    } catch { setStatus('error') } finally { setPending(false) }
  }
  return <form className={`comment-composer comment-composer--${variant}`} onSubmit={(event)=>void submit(event)}>
    <textarea aria-label={labels.commentPlaceholder} disabled={pending} maxLength={2000} onChange={(event)=>setBody(event.target.value)} placeholder={labels.commentPlaceholder} required rows={1} value={body} />
    <button aria-busy={pending} disabled={pending||!body.trim()} type="submit">{pending?labels.commentSending:labels.commentSubmit}</button>
    <span aria-live="polite" className="interaction-error">{status==='success'?labels.commentSuccess:status==='error'?labels.interactionError:''}</span>
  </form>
}
