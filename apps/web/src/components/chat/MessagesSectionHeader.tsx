import Link from 'next/link'
import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import styles from './MessagesWorkspace.module.css'

export type MessagesSectionLabels = {title: string; chatTab: string; notificationsTab: string}

export function MessagesSectionHeader({active, children, labels, locale}: {active: 'chat' | 'notifications'; children?: ReactNode; labels: MessagesSectionLabels; locale: Locale}) {
  return <header className={styles.sectionHeader}>
    <div className={styles.titleRow}><h1>{labels.title}</h1></div>
    {children}
    <nav aria-label={labels.title} className={styles.sectionTabs}>
      <Link aria-current={active === 'chat' ? 'page' : undefined} href={`/${locale}/messages`}>{labels.chatTab}</Link>
      <Link aria-current={active === 'notifications' ? 'page' : undefined} href={`/${locale}/notifications`}>{labels.notificationsTab}</Link>
    </nav>
  </header>
}
