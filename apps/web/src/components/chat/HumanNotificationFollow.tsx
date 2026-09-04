'use client'
import {HumanRelationshipBatchSchema,type HumanRelationshipSummary} from '@aifans/contracts'
import Link from 'next/link'
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {humanProfileLabels} from '../profile/human-profile-labels'
import styles from './HumanNotificationFollow.module.css'
type State={items:HumanRelationshipSummary[];loading:boolean;busy:boolean;error:boolean;authRequired:boolean;mutate(id:string):void;retry():void}
const Context=createContext<State|null>(null)
type Props={children:ReactNode;profileIds:string[];viewerScope?:string}
export function HumanNotificationRelationships(props:Props){return <ScopedRelationships key={props.viewerScope??'guest'} {...props}/>}
function ScopedRelationships({children,profileIds,viewerScope}:Props){
 const ids=JSON.stringify([...new Set(profileIds)].slice(0,50))
 const [items,setItems]=useState<HumanRelationshipSummary[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[authRequired,setAuthRequired]=useState(false),[attempt,setAttempt]=useState(0)
 const controller=useRef<AbortController|null>(null),busyRef=useRef(false)
 async function load(signal:AbortSignal){
  const response=await fetch('/api/human-relationships',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileIds:JSON.parse(ids)}),credentials:'same-origin',cache:'no-store',signal})
  if(response.status===401){if(!signal.aborted)setAuthRequired(true);throw Error()}
  if(!response.ok)throw Error()
  const result=HumanRelationshipBatchSchema.parse(await response.json());const requested:string[]=JSON.parse(ids)
  if(result.items.some(item=>!requested.includes(item.profileId)))throw Error()
  if(!signal.aborted)setItems(result.items)
 }
 useEffect(()=>{
  controller.current?.abort();busyRef.current=false;setBusy(false);setItems([]);setError(false);setAuthRequired(false)
  if(!viewerScope||viewerScope==='unavailable'||ids==='[]'){setLoading(false);return}
  const next=new AbortController();controller.current=next;setLoading(true)
  void load(next.signal).catch(()=>{if(!next.signal.aborted)setError(true)}).finally(()=>{if(!next.signal.aborted)setLoading(false)})
  return()=>next.abort()
 },[ids,viewerScope,attempt])
 useEffect(()=>()=>controller.current?.abort(),[])
 async function mutate(id:string){
  const relation=items.find(item=>item.profileId===id)
  if(!relation||relation.isOwner||relation.blocked||busyRef.current)return
  busyRef.current=true;setBusy(true);setError(false);controller.current?.abort()
  const next=new AbortController();controller.current=next
  try{
   const response=await fetch(`/api/humans/${id}/follow`,{method:relation.following?'DELETE':'PUT',body:'{}',headers:{'content-type':'application/json'},credentials:'same-origin',signal:next.signal})
   if(next.signal.aborted)return
   if(response.status===401){setAuthRequired(true);throw Error()}
   if(!response.ok){if(response.status===403)await load(next.signal);throw Error()}
   const body:unknown=await response.json()
   if(!body||typeof body!=='object'||Object.keys(body).length!==1||!('changed'in body)||typeof body.changed!=='boolean')throw Error()
   await load(next.signal)
  }catch{if(!next.signal.aborted)setError(true)}finally{if(!next.signal.aborted){busyRef.current=false;setBusy(false)}}
 }
 return <Context.Provider value={{items,loading,busy,error,authRequired,mutate:id=>void mutate(id),retry:()=>setAttempt(n=>n+1)}}>{children}</Context.Provider>
}
export function HumanNotificationFollow({profileId,locale}:{profileId:string;locale:Locale}){
 const state=useContext(Context),labels=humanProfileLabels(locale)
 if(!state)return null
 const relation=state.items.find(item=>item.profileId===profileId)
 if(relation?.isOwner)return null
 if(state.authRequired)return <Link className={styles.signIn} href={authHref(locale,`/${locale}/messages/notifications`)}>{labels.signIn}</Link>
 if(!relation)return <div className={styles.action}>{state.loading?<span role="status">{labels.loading}</span>:state.error?<><span role="alert">{labels.error}</span><button onClick={state.retry} type="button">{labels.retry}</button></>:null}</div>
 return <div className={styles.action}>
  <button aria-busy={state.busy} aria-pressed={relation.following} disabled={state.busy||relation.blocked} onClick={()=>state.mutate(profileId)} type="button">{relation.following?labels.following:relation.followedBy?labels.followBack:labels.follow}</button>
  {relation.blocked?<span role="status">{locale==='zh-CN'?'屏蔽期间无法关注。':'Following is unavailable while blocked.'}</span>:null}
  {state.error?<span role="alert">{labels.error}</span>:null}
 </div>
}
