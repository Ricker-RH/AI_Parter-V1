'use client'

import {useEffect, useRef, useState, type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import styles from './ConversationRowActions.module.css'

export function conversationTime(value: string, locale: string, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(day); yesterday.setDate(day.getDate() - 1)
  if (date >= day) return date.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'})
  if (date >= yesterday) return locale === 'zh-CN' ? '昨天' : 'Yesterday'
  return date.toLocaleDateString(locale, {month: 'numeric', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? {year: 'numeric' as const} : {})})
}

export function ConversationRowActions({children, pinned, locale, onAction}: {children: ReactNode; pinned: boolean; locale: string; onAction: (action: 'pin' | 'unpin' | 'delete') => Promise<void>}) {
  const [swiped, setSwiped] = useState(false)
  const [menu, setMenu] = useState<{x: number; y: number} | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const start = useRef<{x: number; y: number} | null>(null)
  const suppressClick = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const zh = locale === 'zh-CN'
  const pinLabel = pinned ? zh ? '取消置顶' : 'Unpin' : zh ? '置顶' : 'Pin'
  const close = () => {if (!busy) {setMenu(null); setConfirm(false); setSwiped(false); setError(false)}}
  useEffect(() => {
    if (!menu && !confirm) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); close()}
      if (event.key === 'Tab') {
        const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (buttons.length) {event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus()}
      }
    }
    document.addEventListener('keydown', key)
    return () => {document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus()}
  }, [menu, confirm, busy])
  async function act(action: 'pin' | 'unpin' | 'delete') {
    if (busy) return
    setBusy(true); setError(false)
    try {await onAction(action); setMenu(null); setConfirm(false); setSwiped(false)} catch {setError(true)} finally {setBusy(false)}
  }
  const buttons = <><button disabled={busy} onClick={() => void act(pinned ? 'unpin' : 'pin')} type="button">{pinLabel}</button><button className={styles.danger} disabled={busy} onClick={() => {setConfirm(true); setMenu(null); setError(false)}} type="button">{zh ? '删除' : 'Delete'}</button></>
  return <div className={styles.row} onContextMenu={event => {event.preventDefault(); event.stopPropagation(); setError(false); setMenu({x: Math.max(8, Math.min(event.clientX, window.innerWidth - 188)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 140))})}} onKeyDown={event => {if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({x: Math.max(8, Math.min(rect.left + 50, window.innerWidth - 188)), y: Math.max(8, Math.min(rect.top, window.innerHeight - 140))})}}}>
    <div className={styles.swipeActions} aria-hidden={!swiped}>{swiped ? buttons : null}</div>
    <div className={styles.content} style={{transform: swiped ? 'translateX(-152px)' : undefined}} onTouchStart={event => {const point = event.touches[0]; if(point) {start.current = {x: point.clientX, y: point.clientY}; suppressClick.current = false}}} onTouchEnd={event => {const point = event.changedTouches[0]; if (point && start.current) {const dx = point.clientX - start.current.x; const dy = point.clientY - start.current.y; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {setSwiped(dx < 0); suppressClick.current = true}} start.current = null}} onClickCapture={event => {if (swiped || suppressClick.current) {event.preventDefault(); event.stopPropagation(); setSwiped(false); suppressClick.current = false}}}>{children}</div>
    {error && !menu && !confirm ? <p role="alert">{zh ? '操作失败，请重试。' : 'Could not complete. Try again.'}</p> : null}
    {(menu || confirm) && createPortal(<div className={styles.backdrop} onClick={event => {event.stopPropagation(); close()}} onContextMenu={event => {event.preventDefault(); event.stopPropagation(); close()}}><div ref={panel} className={confirm ? styles.dialog : styles.menu} style={menu ? {left: menu.x, top: menu.y} : undefined} role={confirm ? 'alertdialog' : 'menu'} aria-modal="true" aria-label={confirm ? zh ? '删除会话？' : 'Delete conversation?' : zh ? '会话操作' : 'Conversation actions'} onClick={event => event.stopPropagation()}>
      {confirm ? <><h2>{zh ? '删除会话？' : 'Delete conversation?'}</h2><p>{zh ? '将删除你这边的聊天记录和会话，无法恢复。对方的记录不受影响。' : 'This removes your conversation and chat history permanently. The other person’s history is unaffected.'}</p><div className={styles.confirmActions}><button disabled={busy} onClick={close} type="button">{zh ? '取消' : 'Cancel'}</button><button className={styles.danger} disabled={busy} onClick={() => void act('delete')} type="button">{busy ? zh ? '删除中…' : 'Deleting…' : zh ? '确认删除' : 'Delete conversation'}</button></div></> : buttons}
      {error ? <p role="alert">{zh ? '操作失败，请重试。' : 'Could not complete. Try again.'}</p> : null}
    </div></div>, document.body)}
  </div>
}
