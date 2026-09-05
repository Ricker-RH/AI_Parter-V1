'use client'

import {CreatorDraftPageSchema,CreatorGenerationResultSchema} from '@aifans/contracts'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useEffect,useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {creatorJson,CreatorClientError,jsonInit} from './client'
import {CreatorHeader} from './CreatorHeader'
import type {CreatorDraft} from './types'
import styles from './CreatorPortal.module.css'

const resultSchema=CreatorGenerationResultSchema
export function CreatorImages({locale}:{locale:Locale}) {
  const zh=locale==='zh-CN',router=useRouter()
  const [drafts,setDrafts]=useState<CreatorDraft[]>([])
  const [selected,setSelected]=useState('')
  const [state,setState]=useState<'loading'|'idle'|'working'|'queued'|'ready'|'error'|'unavailable'>('loading')
  const [result,setResult]=useState<ReturnType<typeof resultSchema.parse>>()
  useEffect(()=>{let active=true;creatorJson('drafts').then((data)=>{const page=CreatorDraftPageSchema.parse(data);if(active){const items=page.items.filter(draft=>draft.status==='draft');setDrafts(items);setSelected(items[0]?.id??'');setState('idle')}}).catch((error)=>{if(!active)return;if(error instanceof CreatorClientError&&error.status===401)router.replace(authHref(locale,`/${locale}/creator/images`));else setState('error')});return()=>{active=false}},[locale,router])
  async function generate(){
    if(!selected||state==='working'||state==='queued')return
    setState('working');setResult(undefined)
    try{const data=resultSchema.parse(await creatorJson(`drafts/${selected}/generation-intent`,jsonInit('POST',{})));setResult(data);setState(data.status)}
    catch(error){if(error instanceof CreatorClientError&&error.status===401)router.replace(authHref(locale,`/${locale}/creator/images`));else setState(error instanceof CreatorClientError&&error.status===503?'unavailable':'error')}
  }
  return <main className={styles.workspace}>
    <CreatorHeader locale={locale} title={zh?'生图':'Generate images'} back={`/${locale}/creator`}/>
    <div className={styles.frame}>
    <section className={`${styles.generation} ${styles.scrollContent}`}>
      <p>{zh?'选择已保存的角色草稿，根据角色设定生成参考图。':'Choose a saved character draft to generate reference images from its description.'}</p>
      {state==='loading'?<p role="status">{zh?'正在加载…':'Loading…'}</p>:null}
      {drafts.length?<label>{zh?'角色草稿':'Character draft'}<select value={selected} disabled={state==='working'||state==='queued'} onChange={event=>{setSelected(event.target.value);setResult(undefined);setState('idle')}}>{drafts.map(draft=><option key={draft.id} value={draft.id}>{draft.displayName}</option>)}</select></label>:state==='idle'?<Link href={`/${locale}/creator/studio`}>{zh?'先创建并保存一个角色 →':'Create and save a character first →'}</Link>:null}
      {state==='queued'?<p role="status">{zh?'生成任务已排队，图片尚未返回。请勿重复提交。':'Your generation is queued. Images are not available yet; please do not resubmit.'}</p>:null}
      {state==='unavailable'?<p role="alert">{zh?'生图服务暂未开放，请稍后再试。':'Image generation is not available yet. Please try again later.'}</p>:null}
      {state==='error'?<p role="alert">{zh?'暂时无法完成操作，请重新进入页面后重试。':'This action could not be completed. Reopen this page to try again.'}</p>:null}
      {state==='ready'&&result?.candidates.length===0?<p role="status">{zh?'服务尚未返回可展示的图片。':'No images were returned by the service.'}</p>:null}
      {result?.candidates.length?<div className={styles.results}>{result.candidates.map((candidate,index)=><img key={candidate.id} src={candidate.readIntent.url} alt={zh?`生成参考图 ${index+1}`:`Generated reference ${index+1}`}/>)}</div>:null}
    </section>
    {drafts.length?<footer className={styles.footer}><button type="button" onClick={generate} disabled={!selected||state==='working'||state==='queued'||state==='unavailable'}>{state==='working'?(zh?'正在提交…':'Submitting…'):(zh?'生成图片':'Generate images')}</button></footer>:null}
    </div>
  </main>
}
