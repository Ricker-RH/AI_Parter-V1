import Link from 'next/link'
import styles from './ActivityTabs.module.css'

type ActivityTab = 'liked' | 'saved'

type Labels = {
  collections?: string
  bookmarks: string
  liked: string
}

export function ActivityTabs({locale, selected, labels}: {locale: string; selected: ActivityTab; labels: Labels}) {
  const tabs: Array<[ActivityTab, string]> = [
    ['liked', labels.liked],
    ['saved', labels.bookmarks],
  ]

  return <nav aria-label={labels.collections ?? labels.liked} className={styles.tabs}>
    <div className={styles.list}>
      {tabs.map(([tab, label]) => <Link
        aria-current={selected === tab ? 'page' : undefined}
        className={styles.tab}
        href={`/${locale}/activity?tab=${tab}`}
        key={tab}
      >{label}</Link>)}
    </div>
  </nav>
}
