'use client'

import {useRouter} from 'next/navigation'
import {useState} from 'react'

export function NotificationReadButton({notificationId,label,pendingLabel,errorLabel}: {notificationId:string;label:string;pendingLabel:string;errorLabel:string}) {
  const router=useRouter();const [pending,setPending]=useState(false);const [error,setError]=useState(false)
  async function markRead() { setPending(true);setError(false);try { const response=await fetch(`/api/social/notifications/${notificationId}/read`,{method:'PUT',credentials:'include'});if(!response.ok)throw new Error('read failed');router.refresh() } catch {setError(true)} finally {setPending(false)} }
  return <><button aria-busy={pending} className="notification-read" disabled={pending} onClick={()=>void markRead()} type="button">{pending?pendingLabel:label}</button><span aria-live="polite" className="interaction-error">{error?errorLabel:''}</span></>
}
