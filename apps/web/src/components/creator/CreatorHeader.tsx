import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import styles from './CreatorPortal.module.css'

export function CreatorHeader({locale,title,back}:{locale:Locale;title:string;back:string}) {
  return <header className={`page-header ${styles.header}`}>
    <Link aria-label={locale==='zh-CN'?'返回':'Back'} href={back} className={styles.back}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m14 5-7 7 7 7"/></svg>
    </Link>
    <h1 className="page-title">{title}</h1>
    <button type="button" className={styles.more} aria-label={locale==='zh-CN'?'更多（即将开放）':'More (coming soon)'} disabled><span aria-hidden="true">•••</span></button>
  </header>
}
