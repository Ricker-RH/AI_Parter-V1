'use client'

import {CreatorDraftPageSchema,CreatorIpPageSchema} from '@aifans/contracts'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {CreatorClientError,creatorJson} from './client'
import {CreatorAnalytics} from './CreatorAnalytics'
import {CreatorDraftForm} from './CreatorDraftForm'
import {CreatorRequestActions} from './CreatorRequestActions'
import type {CreatorDraft,CreatorIp,CreatorLabels} from './types'

export function CreatorCenter({locale,labels}:{locale:Locale;labels:CreatorLabels}){
  const router=useRouter()
  const [drafts,setDrafts]=useState<CreatorDraft[]>([]);const [ips,setIps]=useState<CreatorIp[]>([]);const [state,setState]=useState<'loading'|'ready'|'auth'|'error'>('loading');const [creating,setCreating]=useState(false);const [targetIp,setTargetIp]=useState<string|undefined>()
  const staleSessionRedirected=useRef(false)
  const redirectStaleSession=useCallback(()=>{if(staleSessionRedirected.current)return;staleSessionRedirected.current=true;router.replace(authHref(locale,`/${locale}/creator`))},[locale,router])
  useEffect(()=>{let active=true;(async()=>{try{const draftPage=CreatorDraftPageSchema.parse(await creatorJson('drafts'));const ipPage=CreatorIpPageSchema.parse(await creatorJson('ips'));if(active){setDrafts(draftPage.items);setIps(ipPage.items);setState('ready')}}catch(error){if(!active)return;if(error instanceof CreatorClientError&&error.status===401){redirectStaleSession();return}setState('error')}})();return()=>{active=false}},[redirectStaleSession])
  return <main className="creator-page"><header className="creator-hero"><p>{labels.eyebrow}</p><div><h1>{labels.title}</h1><div className="creator-hero-actions"><Link className="creator-exit" href={`/${locale}/profile`}>{labels.cancel}</Link>{state==='ready'&&!creating?<button onClick={()=>setCreating(true)} type="button">{labels.newIdentity}</button>:null}</div></div><p>{labels.description}</p></header>
    {state==='loading'?<p className="creator-notice" role="status">{labels.loading}</p>:null}
    {state==='error'?<p className="creator-notice" role="alert">{labels.unavailable}</p>:null}
    {state==='auth'?<p className="creator-notice" role="alert">{labels.authRequired} <Link href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link></p>:null}
    {creating?<CreatorDraftForm labels={labels} locale={locale} onCancel={()=>{setCreating(false);setTargetIp(undefined)}} onSaved={(draft)=>{setDrafts((items)=>[draft,...items]);setCreating(false);setTargetIp(undefined)}} {...(targetIp?{targetIpProfileId:targetIp}:{})}/>:null}
    {state==='ready'&&!creating&&drafts.length===0&&ips.length===0?<section className="creator-empty"><span aria-hidden="true">＋</span><h2>{labels.emptyTitle}</h2><p>{labels.emptyDescription}</p></section>:null}
    {drafts.length?<section aria-labelledby="creator-drafts"><h2 className="creator-section-title" id="creator-drafts">{labels.drafts}</h2><div className="creator-list">{drafts.map((draft)=><Link className="creator-list-item" href={`/${locale}/creator/${draft.id}`} key={draft.id}><div><strong>{draft.displayName}</strong><span>@{draft.username}</span></div><span>{draft.status==='draft'?labels.statusDraft:labels.statusSubmitted} →</span></Link>)}</div></section>:null}
    {ips.length?<section aria-labelledby="creator-identities"><h2 className="creator-section-title" id="creator-identities">{labels.identities}</h2>{ips.map((ip)=><div className="creator-ip" key={ip.id}><header><div><strong>{ip.displayName}</strong><span>@{ip.username}</span></div><span>{ip.status}</span></header><CreatorAnalytics ipProfileId={ip.id} labels={labels} onAuthRequired={redirectStaleSession}/><CreatorRequestActions ipProfileId={ip.id} labels={labels} onAuthRequired={redirectStaleSession} onChangeDraft={()=>{setTargetIp(ip.id);setCreating(true)}}/></div>)}</section>:null}
  </main>
}
