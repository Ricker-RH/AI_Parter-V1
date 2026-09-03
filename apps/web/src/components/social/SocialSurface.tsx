import type {ReactNode} from 'react'
import styles from './SocialSurface.module.css'

export function SocialSurface({children, className, frameMode = 'detached', header, label}: {children: ReactNode; className?: string; frameMode?: 'attached' | 'detached'; header: ReactNode; label: string}) {
  const headerContent = <div className={styles.header}>{header}</div>
  const frame = <div className={`${styles.frame}${frameMode === 'attached' ? ` ${styles.attachedFrame}` : ''}`} data-social-surface-frame>
    {frameMode === 'attached' ? headerContent : null}
    <div aria-label={label} className={styles.viewport} data-social-surface-viewport role="region" tabIndex={0}>{children}</div>
  </div>

  return <main className={`${styles.surface}${className ? ` ${className}` : ''}`} data-social-surface data-social-surface-frame-mode={frameMode}>
    {frameMode === 'attached' ? frame : <>{headerContent}{frame}</>}
  </main>
}
