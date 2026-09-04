import {Logo} from '@aifans/ui'
import Link from 'next/link'
import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import styles from '../social/PublicProfileContent.module.css'

function BackIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg> }

export interface ProfilePageHeaderLabels {
  back?: string
}

/** Shared responsive profile chrome. Each profile type owns its own explicit actions. */
export function ProfilePageHeader({actions, backHref, labels, locale, username}: {actions?: ReactNode; backHref: string; labels: ProfilePageHeaderLabels; locale: Locale; username: string}) {
  const back = labels.back ?? (locale === 'zh-CN' ? '返回' : 'Back')
  return <header className={styles.contextualTitle}>
    <Link aria-label={back} className={styles.back} href={backHref}><BackIcon/></Link>
    <h1>@{username}</h1>
    <Link aria-label="AIFANS" className={styles.mobileBrand} href={`/${locale}`}><Logo showWordmark={false}/></Link>
    {actions ? <div className={styles.titleActions}>{actions}</div> : null}
  </header>
}
