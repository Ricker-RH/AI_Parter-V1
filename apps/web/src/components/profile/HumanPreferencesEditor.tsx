'use client'
import type {HumanPreferencesUpdateInput} from '@aifans/contracts'
import {useEffect,useRef,useState} from 'react'
import type {Locale} from '../../i18n/config'
import {parseHumanPreferences,type HumanPreferences} from '../../lib/human-preferences'
import {humanProfileLabels} from './human-profile-labels'
import styles from './HumanPreferencesEditor.module.css'

type PreferenceCopy = {private:string;presence:string;on:string;off:string;privateHelp:string;presenceHelp:string}

function PreferenceRow({checked,help,label,onToggle,placeholderId,value}: {checked?:boolean | undefined;help:string;label:string;onToggle?:()=>void | undefined;placeholderId:string;value?:string | undefined}) {
  return <div className={styles.row} data-testid="human-preference-row">
    {typeof checked === 'boolean' && onToggle ? <button aria-checked={checked} aria-describedby={`${placeholderId}-help`} aria-label={label} className={styles.rowTrigger} onClick={onToggle} role="switch" type="button"><span className={styles.rowLabel}>{label}</span><span className={styles.rowValue}>{value}</span></button> : <div aria-busy="true" className={styles.rowTrigger}><span className={styles.rowLabel}>{label}</span><span className={styles.rowValue}><span aria-hidden="true" className={styles.preferencePlaceholder} data-testid={placeholderId}/></span></div>}
    <p className={styles.fieldError} id={`${placeholderId}-help`}>{help}</p>
  </div>
}

export function HumanPreferencesEditor({locale}:{locale:Locale}){
 const [preferences,setPreferences]=useState<HumanPreferences|null>(null),[pending,setPending]=useState(true),[error,setError]=useState(false),[saved,setSaved]=useState(false)
 const request=useRef<AbortController|null>(null),busy=useRef(false),labels=humanProfileLabels(locale)
 const text=locale==='zh-CN'?{title:'隐私与在线状态',private:'私密主页',presence:'显示在线状态',on:'开启',off:'关闭',privateHelp:'开启后，其他人只能查看基本资料，无法查看四个内容栏目。',presenceHelp:'仅允许互相关注的联系人查看在线状态。',immediate:'此处修改会立即保存。',saved:'已保存。'}:{title:'Privacy and presence',private:'Private profile',presence:'Show online status',on:'On',off:'Off',privateHelp:'Other people can see your basic profile, but all four content sections are hidden.',presenceHelp:'Only mutual contacts can see your online status.',immediate:'Changes here save immediately.',saved:'Saved.'}
 const copy: PreferenceCopy = text
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
 const ready = preferences !== null
 return <section aria-label={text.title} className={styles.form}>
  <div className={styles.message}><h2 style={{fontSize:16,margin:0}}>{text.title}</h2></div>
  <PreferenceRow help={copy.privateHelp} label={copy.private} placeholderId="human-preference-private-placeholder" {...(ready ? {checked: preferences.visibility==='private', onToggle: ()=>void update({visibility:preferences.visibility==='private'?'public':'private'}), value: preferences.visibility==='private' ? copy.on : copy.off} : {})}/>
  <PreferenceRow help={copy.presenceHelp} label={copy.presence} placeholderId="human-preference-presence-placeholder" {...(ready ? {checked: preferences.showPresence, onToggle: ()=>void update({showPresence:!preferences.showPresence}), value: preferences.showPresence ? copy.on : copy.off} : {})}/>
  {pending ? <span className="sr-only" role="status">{labels.loading}</span> : null}
  {error ? <div className={styles.message} role="alert"><p>{labels.error}</p>{!preferences?<button onClick={()=>void update()} type="button">{labels.retry}</button>:null}</div> : null}
  {saved?<p className={styles.message} role="status">{text.saved}</p>:null}
 </section>
}
