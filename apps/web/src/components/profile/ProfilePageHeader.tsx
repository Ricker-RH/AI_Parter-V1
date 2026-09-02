import {AifansSearchIcon, Logo} from '@aifans/ui'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import {GlobalMoreMenu, type MoreMenuLabels} from '../GlobalMoreMenu'
import styles from '../social/PublicProfileContent.module.css'

function BackIcon() { return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg> }

export interface ProfilePageHeaderLabels extends Partial<Omit<MoreMenuLabels, 'more'>> {
  back?: string
  more?: string
  search?: string
}

/** Shared responsive profile header. Public-IP and self-profile pages provide their own content/actions below it. */
export function ProfilePageHeader({backHref, labels, locale, username}: {backHref: string; labels: ProfilePageHeaderLabels; locale: Locale; username: string}) {
  const back = labels.back ?? (locale === 'zh-CN' ? '返回' : 'Back')
  const more = labels.more ?? (locale === 'zh-CN' ? '更多' : 'More')
  const search = labels.search ?? (locale === 'zh-CN' ? '搜索' : 'Search')
  return <header className={styles.contextualTitle}>
    <Link aria-label={back} className={styles.back} href={backHref}><BackIcon/></Link>
    <h1>@{username}</h1>
    <Link aria-label="AIFANS" className={styles.mobileBrand} href={`/${locale}`}><Logo showWordmark={false}/></Link>
    <div className={styles.titleActions}><Link aria-label={search} className={styles.search} href={`/${locale}/search`}><AifansSearchIcon aria-hidden="true"/></Link><div className={styles.more}><GlobalMoreMenu labels={{...labels, more}} locale={locale}/></div></div>
  </header>
}
