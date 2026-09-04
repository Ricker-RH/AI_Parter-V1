'use client'

import {useLayoutEffect, useRef, useState, type ReactNode, type RefObject} from 'react'
import {createPortal} from 'react-dom'
import styles from './ProfileEditor.module.css'

/** Anchored portal using the shared More menu surface and keyboard conventions. */
export function ProfileEditorMenu({anchor, children, id, label, onClose, selector = false}: {
  anchor: RefObject<HTMLButtonElement | null>
  children: ReactNode
  id: string
  label: string
  onClose: () => void
  selector?: boolean
}) {
  const menu = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [position, setPosition] = useState({top: 0, left: 0})

  useLayoutEffect(() => {
    function place() {
      const rect = anchor.current?.getBoundingClientRect()
      const panel = menu.current?.getBoundingClientRect()
      if (!rect || !panel) return
      setPosition({
        left: Math.max(12, Math.min(rect.right - panel.width, window.innerWidth - panel.width - 12)),
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - panel.height - 12)),
      })
    }
    const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? [])]
    place()
    items()[0]?.focus()
    function dismiss() { close.current(); anchor.current?.focus() }
    function outside(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) close.current()
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); return }
      if (!menu.current?.contains(document.activeElement)) return
      const controls = items()
      const current = controls.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'Tab') { close.current(); return }
      // Native radio inputs retain their own arrow-key behavior.
      if (document.activeElement instanceof HTMLInputElement) return
      const destination = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : event.key === 'ArrowDown' ? (current + 1) % controls.length : event.key === 'ArrowUp' ? (current - 1 + controls.length) % controls.length : -1
      if (destination >= 0) { event.preventDefault(); controls[destination]?.focus() }
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', keydown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, id])

  return createPortal(<div aria-label={label} className={`global-more-menu ${styles.assetMenu}`} id={id} ref={menu} role={selector ? 'dialog' : 'menu'} style={{...position, position: 'fixed', bottom: 'auto'}}>{children}</div>, document.body)
}
