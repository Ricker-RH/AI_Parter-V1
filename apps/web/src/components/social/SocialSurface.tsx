import type {ReactNode} from 'react'
import styles from './SocialSurface.module.css'

export function SocialSurface({children, className, header, label}: {children: ReactNode; className?: string; header: ReactNode; label: string}) {
  return <main className={`${styles.surface}${className ? ` ${className}` : ''}`} data-social-surface>
    <div className={styles.header}>{header}</div>
    <div className={styles.frame} data-social-surface-frame>
      <div aria-label={label} className={styles.viewport} data-social-surface-viewport role="region" tabIndex={0}>{children}</div>
    </div>
  </main>
}
