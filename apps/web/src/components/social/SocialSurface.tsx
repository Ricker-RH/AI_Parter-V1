'use client'

import {useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type TouchEvent} from 'react'
import styles from './SocialSurface.module.css'

type RefreshLabels = {idle: string; refreshing: string; success: string}
const pullRefreshThreshold = 56
export function shouldTriggerPullRefresh(distance: number) { return distance >= pullRefreshThreshold }

export function SocialSurface({children, className, frameMode = 'detached', header, label, onRefresh, refreshLabels, viewportLayout = 'scroll'}: {children: ReactNode; className?: string; frameMode?: 'attached' | 'detached'; header: ReactNode; label: string; onRefresh?: () => Promise<void>; refreshLabels?: RefreshLabels; viewportLayout?: 'scroll' | 'docked'}) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshState, setRefreshState] = useState<'idle' | 'refreshing' | 'success'>('idle')
  const startY = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const labels = refreshLabels ?? {idle: 'Pull to refresh', refreshing: 'Refreshing…', success: 'Updated'}
  const refreshEnabled = viewportLayout === 'scroll' && Boolean(onRefresh)

  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }, [])

  async function refresh() {
    if (!onRefresh || refreshState === 'refreshing') return
    setPullDistance(0)
    setRefreshState('refreshing')
    try {
      await onRefresh()
      setRefreshState('success')
      refreshTimer.current = setTimeout(() => setRefreshState('idle'), 1_500)
    } catch {
      setRefreshState('idle')
    }
  }

  function beginPull(y: number | undefined, scrollTop: number) {
    if (!refreshEnabled || refreshState === 'refreshing' || scrollTop > 0 || y === undefined) return
    startY.current = y
  }

  function updatePull(y: number | undefined, scrollTop: number, preventDefault: () => void) {
    if (startY.current === null || scrollTop > 0 || y === undefined) return
    const movement = y - startY.current
    if (movement <= 0) { pullDistanceRef.current = 0; setPullDistance(0); return }
    preventDefault()
    const distance = Math.min(84, movement * 0.55)
    pullDistanceRef.current = distance
    setPullDistance(distance)
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) { beginPull(event.touches[0]?.clientY, event.currentTarget.scrollTop) }
  function onTouchMove(event: TouchEvent<HTMLDivElement>) { updatePull(event.touches[0]?.clientY, event.currentTarget.scrollTop, () => event.preventDefault()) }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) { beginPull(event.clientY, event.currentTarget.scrollTop) }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) { updatePull(event.clientY, event.currentTarget.scrollTop, () => event.preventDefault()) }

  function onTouchEnd() {
    const shouldRefresh = shouldTriggerPullRefresh(pullDistanceRef.current)
    startY.current = null
    pullDistanceRef.current = 0
    setPullDistance(0)
    if (shouldRefresh) void refresh()
  }

  const headerContent = <div className={styles.header}>{header}</div>
  const refreshContent = refreshEnabled ? <><div aria-live="polite" className={styles.refreshIndicator} data-pull-refresh-indicator><span aria-hidden="true" className={`${styles.refreshSpinner}${refreshState === 'refreshing' ? ` ${styles.refreshSpinnerActive}` : ''}`}/><span>{refreshState === 'refreshing' ? labels.refreshing : refreshState === 'success' ? labels.success : labels.idle}</span></div><div className={styles.refreshContent}>{children}</div></> : children
  const viewportStyle = refreshEnabled ? {'--pull-refresh-offset': `${pullDistance}px`} as CSSProperties : undefined
  const frame = <div className={`${styles.frame}${frameMode === 'attached' ? ` ${styles.attachedFrame}` : ''}`} data-social-surface-frame>
    {frameMode === 'attached' ? headerContent : null}
    <div
      {...(viewportLayout === 'scroll' ? {'aria-label': label, role: 'region', tabIndex: 0} : {})}
      {...(refreshEnabled ? {'data-refresh-state': refreshState, onPointerDown, onPointerMove, onPointerUp: onTouchEnd, onTouchEnd, onTouchMove, onTouchStart, style: viewportStyle} : {})}
      className={`${styles.viewport}${viewportLayout === 'docked' ? ` ${styles.dockedViewport}` : ''}${refreshEnabled ? ` ${styles.refreshViewport}` : ''}`}
      data-social-surface-viewport
      data-social-surface-viewport-layout={viewportLayout}
    >{refreshContent}</div>
  </div>

  return <main className={`${styles.surface}${className ? ` ${className}` : ''}`} data-social-surface data-social-surface-frame-mode={frameMode}>
    {frameMode === 'attached' ? frame : <>{headerContent}{frame}</>}
  </main>
}
