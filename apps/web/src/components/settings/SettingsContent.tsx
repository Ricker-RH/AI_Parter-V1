'use client'

import Link from 'next/link'
import {useEffect, useState} from 'react'
import {useTheme} from 'next-themes'
import type {Locale} from '../../i18n/config'
import {AuthAccountControl} from '../auth/AuthAccountControl'
import {HumanPreferencesEditor} from '../profile/HumanPreferencesEditor'
import styles from './SettingsContent.module.css'

const themes = [{key:'system',zh:'跟随系统',en:'System',color:'linear-gradient(90deg,#fafafa 50%,#171717 50%)'}, {key:'light',zh:'浅色',en:'Light',color:'#fafafa'}, {key:'dark',zh:'深色',en:'Dark',color:'#171717'}, {key:'sage',zh:'鼠尾草绿',en:'Sage',color:'#e1ebe1'}, {key:'lavender',zh:'雾紫',en:'Lavender',color:'#e9e2f3'}, {key:'sand',zh:'奶油米',en:'Sand',color:'#eee4d4'}, {key:'midnight',zh:'午夜蓝',en:'Midnight',color:'#22324c'}]
function SettingIcon({kind}:{kind:'profile'|'theme'|'language'|'motion'}) {
 const paths={profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21v-2a7 7 0 0 1 14 0v2',theme:'M12 3a9 9 0 1 0 9 9c-5 2-11-4-9-9Z',language:'M3 5h12M9 3v2M6 5c0 6 5 9 8 10M13 5c0 6-5 9-10 11M14 21l4-10 4 10M16 17h4',motion:'m13 2-9 12h7l-1 8 10-12h-7l1-8Z'}
 return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]}/></svg>
}
export function SettingsContent({locale,configured}:{locale:Locale;configured:boolean}) {
 const zh=locale==='zh-CN', {theme,setTheme}=useTheme()
 const [mounted,setMounted]=useState(false),[motion,setMotion]=useState('system')
 useEffect(()=>{setMounted(true);if(location.hash==='#appearance'){document.querySelector<HTMLDetailsElement>('#appearance')?.setAttribute('open','')};try{setMotion(localStorage.getItem('aifans-motion')==='reduce'?'reduce':'system')}catch{}},[])
 function updateMotion(value:string){setMotion(value);document.documentElement.dataset.motion=value;try{localStorage.setItem('aifans-motion',value)}catch{};window.dispatchEvent(new Event('aifans:motion'))}
 const themeName=themes.find(t=>t.key===theme)
 return <div className={styles.root}>
  <section className={styles.group}><h2>{zh?'账号与资料':'Account and profile'}</h2><div className={styles.card}>
   <Link className={styles.row} href={`/${locale}/profile/edit?returnTo=${encodeURIComponent(`/${locale}/settings`)}`}><span className={styles.label}><SettingIcon kind="profile"/>{zh?'个人资料':'Edit profile'}</span><span className={styles.value}>{zh?'头像、昵称与简介':'Avatar, name and bio'} <b aria-hidden="true">›</b></span></Link>

  </div></section>
  <section className={`${styles.group} ${styles.privacy}`}><HumanPreferencesEditor locale={locale}/></section>
  <section className={styles.group}><h2>{zh?'外观与语言':'Appearance and language'}</h2><div className={styles.card}>
   <details id="appearance"><summary className={styles.row}><span className={styles.label}><SettingIcon kind="theme"/>{zh?'外观主题':'Theme'}</span><span className={styles.value}>{mounted&&themeName?(zh?themeName.zh:themeName.en):zh?'跟随系统':'System'} <b aria-hidden="true">›</b></span></summary><div className={styles.palettes}>{themes.map(t=><button key={t.key} type="button" aria-pressed={mounted&&theme===t.key} onClick={()=>setTheme(t.key)}><span className={styles.swatch} style={{background:t.color}} aria-hidden="true"/><span>{zh?t.zh:t.en}</span>{mounted&&theme===t.key?<span aria-hidden="true">✓</span>:null}</button>)}</div></details>
   <details><summary className={styles.row}><span className={styles.label}><SettingIcon kind="language"/>{zh?'显示语言':'Display language'}</span><span className={styles.value}>{zh?'简体中文':'English'} <b aria-hidden="true">›</b></span></summary><div className={styles.options}><Link href="/zh-CN/settings" aria-current={zh?'true':undefined}>简体中文 {zh?'✓':''}</Link><Link href="/en/settings" aria-current={!zh?'true':undefined}>English {!zh?'✓':''}</Link></div></details>
  </div></section>
  <section className={styles.group}><h2>{zh?'动态效果':'Motion'}</h2><div className={styles.card}><details><summary className={styles.row}><span className={styles.label}><SettingIcon kind="motion"/>{zh?'动画效果':'Animations'}</span><span className={styles.value}>{motion==='reduce'?(zh?'减少动态':'Reduced'):(zh?'跟随系统':'System')} <b aria-hidden="true">›</b></span></summary><div className={styles.options}>{['system','reduce'].map(value=><button key={value} type="button" aria-pressed={motion===value} onClick={()=>updateMotion(value)}>{value==='system'?(zh?'跟随系统':'Follow system'):(zh?'减少动态':'Reduce motion')} {motion===value?'✓':''}</button>)}</div></details></div><p className={styles.help}>{zh?'减少头像光圈等动画，让浏览更平静。设置仅用于当前设备。':'Reduce avatar and interface animations. Applies to this device.'}</p></section>
  <section className={styles.group}><h2>{zh?'账号操作':'Account actions'}</h2><div className={styles.card}><AuthAccountControl configured={configured} locale={locale} settings/></div></section>
 </div>
}
