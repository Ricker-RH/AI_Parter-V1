'use client'

import {HumanProfileSchema,type HumanProfile} from '@aifans/contracts'
import {QueryClientProvider,useQuery,useQueryClient} from '@tanstack/react-query'
import Link from 'next/link'
import {useContext,useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {Locale} from '../../i18n/config'
import {AppQueryContext,createAppQueryClient} from '../AppQueryProvider'
import {HumanAvatar} from '../account/HumanAvatar'
import {HumanProfileActions} from '../profile/HumanProfileActions'
import {humanProfileLabels} from '../profile/human-profile-labels'

type Props={human:{id:string;displayName:string;avatarUrl?:string|null|undefined};locale:Locale;viewerScope?:string}

function humanProfilePreviewKey(profileId:string,viewerScope?:string){return ['human-profile-preview',viewerScope??'guest',profileId] as const}

async function loadHumanProfile(profileId:string,signal?:AbortSignal):Promise<HumanProfile>{
 const response=await fetch(`/api/humans/${profileId}`,{cache:'no-store',credentials:'same-origin',...(signal?{signal}:{})})
 if(!response.ok)throw Error('profile unavailable')
 const next=HumanProfileSchema.parse(await response.json())
 if(next.identity.id!==profileId)throw Error('profile unavailable')
 return next
}

function ScopedHumanAuthorPreview({human,locale,viewerScope}:Props){
 const [open,setOpen]=useState(false)
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null),labels=humanProfileLabels(locale)
 const queryClient=useQueryClient(),queryKey=humanProfilePreviewKey(human.id,viewerScope)
 const query=useQuery({queryKey,queryFn:({signal})=>loadHumanProfile(human.id,signal),enabled:open,retry:false,staleTime:30_000})
 const profile=query.data??null
 const href=`/${locale}/humans/${human.id}`,identity=profile?.identity??human
 function close(){setOpen(false);trigger.current?.focus()}
 function prefetchProfile(){void queryClient.prefetchQuery({queryKey,queryFn:({signal})=>loadHumanProfile(human.id,signal),staleTime:30_000})}
 function updateProfile(next:HumanProfile){queryClient.setQueryData(queryKey,next)}
 useEffect(()=>{
  if(!open)return
  dialog.current?.querySelector<HTMLElement>('button,a')?.focus()
  function keydown(e:KeyboardEvent){
   if(e.key==='Escape'){e.preventDefault();close();return}
   if(e.key!=='Tab')return
   const items=[...(dialog.current?.querySelectorAll<HTMLElement>('a,button:not([disabled])')??[])],first=items[0],last=items.at(-1)
   if(!first||!last)return
   if(!dialog.current?.contains(document.activeElement)||(e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first).focus()}
  }
  document.addEventListener('keydown',keydown);return()=>document.removeEventListener('keydown',keydown)
 },[open])
 return <div className="author-preview"><button aria-expanded={open} aria-haspopup="dialog" aria-label={`${labels.profile}: ${identity.displayName}`} className="comment-avatar-trigger" onClick={()=>setOpen(true)} onFocus={prefetchProfile} onPointerDown={prefetchProfile} onPointerEnter={prefetchProfile} ref={trigger} type="button"><HumanAvatar className="comment-avatar" decorative human={identity} size="medium"/></button>
 {open?createPortal(<div className="author-preview-backdrop" onClick={e=>e.stopPropagation()} onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div aria-label={identity.displayName} aria-modal="true" className="author-preview-dialog" ref={dialog} role="dialog">
  <div className="author-preview-heading"><div><Link href={href}><strong>{identity.displayName}</strong></Link>{profile?<span>@{profile.identity.username}</span>:null}</div><Link aria-label={`${labels.profile}: ${identity.displayName}`} href={href}><HumanAvatar human={identity} size="large"/></Link></div>
  {profile?.bio?<p className="author-preview-bio">{profile.bio}</p>:null}
  {profile?<HumanProfileActions locale={locale} onProfileChange={updateProfile} profile={profile}/>:query.isError?<p role="alert">{labels.error} <button onClick={()=>void query.refetch()} type="button">{labels.retry}</button></p>:<p role="status">{labels.loading}</p>}
  <button onClick={close} type="button">{labels.close}</button>
 </div></div>,document.body):null}</div>
}

export function HumanAuthorPreview(props:Props){
 const shared=useContext(AppQueryContext)
 const [client]=useState(createAppQueryClient)
 const preview=<ScopedHumanAuthorPreview key={`${props.human.id}:${props.viewerScope??'guest'}`} {...props}/>
 return shared?preview:<QueryClientProvider client={client}>{preview}</QueryClientProvider>
}
