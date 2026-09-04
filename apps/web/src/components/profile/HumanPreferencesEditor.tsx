'use client'
import type {HumanPreferencesUpdateInput} from '@aifans/contracts'
import {useEffect,useRef,useState} from 'react'
import type {Locale} from '../../i18n/config'
import {parseHumanPreferences,type HumanPreferences} from '../../lib/human-preferences'
import {humanProfileLabels} from './human-profile-labels'
import styles from './ProfileEditor.module.css'
export function HumanPreferencesEditor({locale}:{locale:Locale}){
 const [preferences,setPreferences]=useState<HumanPreferences|null>(null),[pending,setPending]=useState(true),[error,setError]=useState(false),[saved,setSaved]=useState(false)
 const request=useRef<AbortController|null>(null),busy=useRef(false),labels=humanProfileLabels(locale)
 const text=locale==='zh-CN'?{title:'隐私与在线状态',private:'私密主页',presence:'显示在线状态',on:'开启',off:'关闭',privateHelp:'开启后，其他人只能查看基本资料，无法查看四个内容栏目。',presenceHelp:'仅允许互相关注的联系人查看在线状态。',immediate:'此处修改会立即保存。',saved:'已保存。'}:{title:'Privacy and presence',private:'Private profile',presence:'Show online status',on:'On',off:'Off',privateHelp:'Other people can see your basic profile, but all four content sections are hidden.',presenceHelp:'Only mutual contacts can see your online status.',immediate:'Changes here save immediately.',saved:'Saved.'}
 async function update(input?:HumanPreferencesUpdateInput){
  if(busy.current)return
  busy.current=true;request.current?.abort();const controller=new AbortController();request.current=controller
  setPending(true);setError(false);setSaved(false)
  try{
   const response=await fetch('/api/human-preferences',{credentials:'same-origin',cache:'no-store',signal:controller.signal,...(input?{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(input)}:{})})
   if(!response.ok)throw Error()
   const value=parseHumanPreferences(await response.json());if(!value)throw Error()
   if(!controller.signal.aborted){setPreferences(value);setSaved(Boolean(input))}
  }catch{if(!controller.signal.aborted)setError(true)}finally{if(!controller.signal.aborted){busy.current=false;setPending(false)}}
 }
 useEffect(()=>{void update();return()=>{request.current?.abort();busy.current=false}},[])
 return <section aria-label={text.title} className={styles.form} style={{marginTop:16}}>
  <div className={styles.message}><h2 style={{fontSize:16,margin:0}}>{text.title}</h2><p>{text.immediate}</p></div>
  {preferences?<>
   <div className={styles.row}><button aria-checked={preferences.visibility==='private'} aria-describedby="human-private-help" aria-label={text.private} className={styles.rowTrigger} disabled={pending} onClick={()=>void update({visibility:preferences.visibility==='private'?'public':'private'})} role="switch" type="button"><span className={styles.rowLabel}>{text.private}</span><span className={styles.rowValue}>{preferences.visibility==='private'?text.on:text.off}</span></button><p className={styles.fieldError} id="human-private-help">{text.privateHelp}</p></div>
   <div className={styles.row}><button aria-checked={preferences.showPresence} aria-describedby="human-presence-help" aria-label={text.presence} className={styles.rowTrigger} disabled={pending} onClick={()=>void update({showPresence:!preferences.showPresence})} role="switch" type="button"><span className={styles.rowLabel}>{text.presence}</span><span className={styles.rowValue}>{preferences.showPresence?text.on:text.off}</span></button><p className={styles.fieldError} id="human-presence-help">{text.presenceHelp}</p></div>
  </>:null}
  {pending?<p className={styles.message} role="status">{labels.loading}</p>:null}
  {error?<div className={styles.message} role="alert"><p>{labels.error}</p>{!preferences?<button onClick={()=>void update()} type="button">{labels.retry}</button>:null}</div>:null}
  {saved?<p className={styles.message} role="status">{text.saved}</p>:null}
 </section>
}
