import styles from './ActivityTabs.module.css'

type ActivityTab = 'notifications' | 'liked' | 'saved'

type Labels = {
  activity?: string
  bookmarks: string
  liked: string
  notifications: string
}

export function ActivityTabs({locale, selected, labels}: {locale: string; selected: ActivityTab; labels: Labels}) {
  const tabs: Array<[ActivityTab, string]> = [
    ['notifications', labels.notifications],
    ['liked', labels.liked],
    ['saved', labels.bookmarks],
  ]

  return <nav aria-label={labels.activity ?? labels.notifications} className={styles.tabs}>
    <div className={styles.list}>
      {tabs.map(([tab, label]) => <a
        aria-current={selected === tab ? 'page' : undefined}
        className={styles.tab}
        href={`/${locale}/activity?tab=${tab}`}
        key={tab}
      >{label}</a>)}
    </div>
  </nav>
}
