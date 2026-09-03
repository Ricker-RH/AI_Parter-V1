import type {ReactNode} from 'react'
import styles from './SocialSurface.module.css'

export function SocialSurface({children, className, frameMode = 'detached', header, label, viewportLayout = 'scroll'}: {children: ReactNode; className?: string; frameMode?: 'attached' | 'detached'; header: ReactNode; label: string; viewportLayout?: 'scroll' | 'docked'}) {
  const headerContent = <div className={styles.header}>{header}</div>
  const frame = <div className={`${styles.frame}${frameMode === 'attached' ? ` ${styles.attachedFrame}` : ''}`} data-social-surface-frame>
    {frameMode === 'attached' ? headerContent : null}
    <div
      {...(viewportLayout === 'scroll' ? {'aria-label': label, role: 'region', tabIndex: 0} : {})}
      className={`${styles.viewport}${viewportLayout === 'docked' ? ` ${styles.dockedViewport}` : ''}`}
      data-social-surface-viewport
      data-social-surface-viewport-layout={viewportLayout}
    >{children}</div>
  </div>

  return <main className={`${styles.surface}${className ? ` ${className}` : ''}`} data-social-surface data-social-surface-frame-mode={frameMode}>
    {frameMode === 'attached' ? frame : <>{headerContent}{frame}</>}
  </main>
}
