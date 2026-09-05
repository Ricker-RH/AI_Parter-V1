'use client'

import {CreatorDraftPageSchema,CreatorIpPageSchema} from '@aifans/contracts'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref,creatorHref} from '../../lib/auth/return-to'
import {CreatorClientError,creatorJson} from './client'
import {CreatorAnalytics} from './CreatorAnalytics'
import {CreatorDraftForm} from './CreatorDraftForm'
import {CreatorHero} from './CreatorHero'
import {CreatorRequestActions} from './CreatorRequestActions'
import type {CreatorDraft,CreatorIp,CreatorLabels} from './types'
import {CreatorHeader} from './CreatorHeader'
import styles from './CreatorPortal.module.css'

export function CreatorCenter({locale,labels,returnTo,workspace=false}:{locale:Locale;labels:CreatorLabels;returnTo?:string;workspace?:boolean}){
  const router=useRouter()
  const [drafts,setDrafts]=useState<CreatorDraft[]>([]);const [ips,setIps]=useState<CreatorIp[]>([]);const [state,setState]=useState<'loading'|'ready'|'auth'|'error'>('loading');const [creating,setCreating]=useState(workspace);const [targetIp,setTargetIp]=useState<string|undefined>()
  const [tab,setTab]=useState<'create'|'drafts'|'published'>('create')
  const [description,setDescription]=useState('')
  const [visibility,setVisibility]=useState<'private'|'public'>('private')
  const zh=locale==='zh-CN'
  const staleSessionRedirected=useRef(false)
  const creatorReturnTo=returnTo?creatorHref(locale,returnTo):`/${locale}/creator`
  const redirectStaleSession=useCallback(()=>{if(staleSessionRedirected.current)return;staleSessionRedirected.current=true;router.replace(authHref(locale,creatorReturnTo))},[creatorReturnTo,locale,router])
  useEffect(()=>{let active=true;(async()=>{try{const draftPage=CreatorDraftPageSchema.parse(await creatorJson('drafts'));const ipPage=CreatorIpPageSchema.parse(await creatorJson('ips'));if(active){setDrafts(draftPage.items);setIps(ipPage.items);setState('ready')}}catch(error){if(!active)return;if(error instanceof CreatorClientError&&error.status===401){redirectStaleSession();return}setState('error')}})();return()=>{active=false}},[redirectStaleSession])
  return <main className="creator-page">{workspace?<><CreatorHeader locale={locale} title={zh?'角色创作':'Character studio'} back={`/${locale}/creator`}/><div className={styles.tabs} role="tablist" aria-label={zh?'角色工作区':'Character workspace'}>{(['create','drafts','published'] as const).map((value,index)=><button key={value} id={`creator-tab-${value}`} type="button" role="tab" aria-selected={tab===value} aria-controls={`creator-panel-${value}`} tabIndex={tab===value?0:-1} onKeyDown={(event)=>{const values=['create','drafts','published'] as const;const next=event.key==='ArrowRight'?values[(index+1)%3]:event.key==='ArrowLeft'?values[(index+2)%3]:event.key==='Home'?'create':event.key==='End'?'published':undefined;if(next){event.preventDefault();setTab(next);document.getElementById(`creator-tab-${next}`)?.focus()}}} onClick={()=>setTab(value)}>{(zh?['创作','草稿','已发布']:['Create','Drafts','Published'])[index]}</button>)}</div></>:<CreatorHero labels={labels} locale={locale} {...(returnTo?{returnTo}:{})} {...(state==='ready'&&!creating?{onNewIdentity:()=>setCreating(true)}:{})}/>}
    {state==='loading'?<p className="creator-notice" role="status">{labels.loading}</p>:null}
    {state==='error'?<p className="creator-notice" role="alert">{labels.unavailable}</p>:null}
    {state==='auth'?<p className="creator-notice" role="alert">{labels.authRequired} <Link href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link></p>:null}
    <div id="creator-panel-create" {...(workspace?{role:'tabpanel','aria-labelledby':'creator-tab-create',hidden:tab!=='create'}:{})}>
    {workspace?<><div className={styles.composer}><label htmlFor="creator-description">{zh?'描述你的 IP':'Describe your IP'}</label><textarea id="creator-description" value={description} onChange={event=>setDescription(event.target.value)} placeholder={zh?'写下你对这个角色的想法…':'Tell us about the character you have in mind…'} rows={7} maxLength={5000}/></div><fieldset className={styles.visibility}><legend>{zh?'可见范围':'Visibility'}</legend><label><input type="radio" name="creator-visibility" value="private" checked={visibility==='private'} onChange={()=>setVisibility('private')}/>{zh?'私人':'Private'}</label><label><input type="radio" name="creator-visibility" value="public" checked={visibility==='public'} onChange={()=>setVisibility('public')}/>{zh?'公开':'Public'}</label><p>{visibility==='private'?(zh?'只有你能查看这个 IP 的帖子并与其聊天，无需审核。':'Only you can see this IP’s posts and chat with it. No review required.'):(zh?'公开的 IP 需要审核通过后才能对外展示。':'Public IPs require approval before they can be visible to others.')}</p></fieldset><p className={styles.pending}>{zh?'创建功能准备中，当前输入尚未保存。':'Creation is being prepared. Your current input is not saved.'}</p></>:creating?<CreatorDraftForm labels={labels} locale={locale} onCancel={()=>{setCreating(false);setTargetIp(undefined)}} onSaved={(draft)=>{setDrafts((items)=>[draft,...items]);setCreating(false);setTargetIp(undefined)}} {...(targetIp?{targetIpProfileId:targetIp}:{})}/>:null}
    </div>
    {state==='ready'&&!creating&&drafts.length===0&&ips.length===0?<section className="creator-empty"><span aria-hidden="true">＋</span><h2>{labels.emptyTitle}</h2><p>{labels.emptyDescription}</p></section>:null}
    <div id="creator-panel-drafts" {...(workspace?{role:'tabpanel','aria-labelledby':'creator-tab-drafts',hidden:tab!=='drafts'}:{})}>
    {drafts.length?<section aria-labelledby="creator-drafts"><h2 className="creator-section-title" id="creator-drafts">{labels.drafts}</h2><div className="creator-list">{drafts.map((draft)=><Link className="creator-list-item" href={`/${locale}/creator/${draft.id}`} key={draft.id}><div><strong>{draft.displayName}</strong><span>@{draft.username}</span></div><span>{draft.status==='draft'?labels.statusDraft:labels.statusSubmitted} →</span></Link>)}</div></section>:workspace&&state==='ready'?<p className={styles.empty}>{zh?'还没有草稿，保存后的创作会出现在这里。':'Your saved drafts will appear here.'}</p>:null}
    </div>
    <div id="creator-panel-published" {...(workspace?{role:'tabpanel','aria-labelledby':'creator-tab-published',hidden:tab!=='published'}:{})}>
    {ips.length?<section aria-labelledby="creator-identities"><h2 className="creator-section-title" id="creator-identities">{labels.identities}</h2>{ips.map((ip)=><div className="creator-ip" key={ip.id}><header><div><strong>{ip.displayName}</strong><span>@{ip.username}</span></div><span>{ip.status}</span></header><CreatorAnalytics ipProfileId={ip.id} labels={labels} onAuthRequired={redirectStaleSession}/><CreatorRequestActions ipProfileId={ip.id} labels={labels} onAuthRequired={redirectStaleSession} onChangeDraft={()=>{setTargetIp(ip.id);setCreating(true);setTab('create')}}/></div>)}</section>:workspace&&state==='ready'?<p className={styles.empty}>{zh?'已审核的角色会出现在这里。':'Your reviewed characters will appear here.'}</p>:null}
    </div>
  </main>
}
