import type {PublicIp} from '@aifans/contracts'
import Link from 'next/link'
import type {Locale} from '../../i18n/config'
import styles from './ChannelPage.module.css'

export function ChannelIpRail({empty, items, labels, locale, profilesHref}: {empty: string; items: PublicIp[]; labels: {title: string; viewAll: string}; locale: Locale; profilesHref: string}) {
  return <section className={styles.ipSection}>
    <header className={styles.ipHeader}><h2>{labels.title}</h2>{items.length ? <Link href={profilesHref}>{labels.viewAll}</Link> : null}</header>
    {items.length
      ? <div aria-label={labels.title} className={styles.ipRail} role="list">{items.map((ip) => <div key={ip.id} role="listitem"><Link aria-label={ip.displayName} className={styles.ipCard} href={`/${locale}/profiles/${ip.id}`}><span aria-hidden="true" className={styles.ipAvatar} data-initial={ip.displayName.slice(0, 1)} /><strong>{ip.displayName}</strong></Link></div>)}</div>
      : <p className={styles.ipEmpty}>{empty}</p>}
  </section>
}
