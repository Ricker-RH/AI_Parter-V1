'use client'
import {HumanProfileSchema,type HumanProfile} from '@aifans/contracts'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {Locale} from '../../i18n/config'
import {HumanAvatar} from '../account/HumanAvatar'
import {HumanProfileActions} from '../profile/HumanProfileActions'
import {humanProfileLabels} from '../profile/human-profile-labels'
type Props={human:{id:string;displayName:string;avatarUrl?:string|null|undefined};locale:Locale;viewerScope?:string}
export function HumanAuthorPreview(props:Props){return <ScopedHumanAuthorPreview key={`${props.human.id}:${props.viewerScope??'guest'}`} {...props}/>}
function ScopedHumanAuthorPreview({human,locale}:Props){
 const [open,setOpen]=useState(false),[profile,setProfile]=useState<HumanProfile|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0)
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null),labels=humanProfileLabels(locale)
 const href=`/${locale}/humans/${human.id}`,identity=profile?.identity??human
 function close(){setOpen(false);trigger.current?.focus()}
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
 useEffect(()=>{
  if(!open)return
  const controller=new AbortController();setFailed(false);setProfile(null)
  void fetch(`/api/humans/${human.id}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error()
   const next=HumanProfileSchema.parse(await response.json());if(next.identity.id!==human.id)throw Error()
   if(!controller.signal.aborted)setProfile(next)
  }).catch(()=>{if(!controller.signal.aborted)setFailed(true)})
  return()=>controller.abort()
 },[human.id,open,attempt])
 return <div className="author-preview"><button aria-expanded={open} aria-haspopup="dialog" aria-label={`${labels.profile}: ${identity.displayName}`} className="comment-avatar-trigger" onClick={()=>setOpen(true)} ref={trigger} type="button"><HumanAvatar className="comment-avatar" decorative human={identity} size="medium"/></button>
 {open?createPortal(<div className="author-preview-backdrop" onClick={e=>e.stopPropagation()} onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div aria-label={identity.displayName} aria-modal="true" className="author-preview-dialog" ref={dialog} role="dialog">
  <div className="author-preview-heading"><div><Link href={href}><strong>{identity.displayName}</strong></Link>{profile?<span>@{profile.identity.username}</span>:null}</div><Link aria-label={`${labels.profile}: ${identity.displayName}`} href={href}><HumanAvatar human={identity} size="large"/></Link></div>
  {profile?.bio?<p className="author-preview-bio">{profile.bio}</p>:null}
  {profile?<HumanProfileActions locale={locale} onProfileChange={setProfile} profile={profile}/>:failed?<p role="alert">{labels.error} <button onClick={()=>setAttempt(value=>value+1)} type="button">{labels.retry}</button></p>:<p role="status">{labels.loading}</p>}
  <button onClick={close} type="button">{labels.close}</button>
 </div></div>,document.body):null}</div>
}
