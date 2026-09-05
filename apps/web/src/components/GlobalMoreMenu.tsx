'use client'

import Link from 'next/link'
import {useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent} from 'react'
import type {Locale} from '../i18n/config'
import {ThemeControls} from './ThemeProvider'
import {createBrowserAuthActions} from './auth/AuthPanel'
import {ReportProblemDialog, type ReportProblemLabels} from './ReportProblemDialog'

export interface MoreMenuLabels extends Partial<ReportProblemLabels> {
  more: string
  appearance?: string
  appearanceBack?: string
  settings?: string
  contact?: string
  signOut?: string
  contactUnavailable?: string
  reportProblem?: string
  themeSystem?: string
  themeLight?: string
  themeDark?: string
  sessionChecking?: string
}

function MoreIcon() {
  return <svg aria-hidden="true" className="more-trigger-icon" fill="none" viewBox="0 0 24 24"><path d="M4 7h16M4 12h12M4 17h8" stroke="currentColor" strokeLinecap="round" strokeWidth="2"/></svg>
}

const reportFallbacks: ReportProblemLabels = {
  close: 'Close',
  reportProblemTitle: 'Report a problem',
  reportProblemDescription: 'Tell us what happened.',
  reportCategory: 'Category',
  reportCategoryBug: 'Bug',
  reportCategorySafety: 'Safety',
  reportCategoryOther: 'Other',
  reportDetails: 'Details',
  reportDetailsPlaceholder: 'Describe the problem',
  reportContact: 'Contact email (optional)',
  reportContactPlaceholder: 'you@example.com',
  reportSubmit: 'Submit report',
  reportUnavailable: 'Reporting is not configured yet.',
}

export function GlobalMoreMenu({authenticated, contactHref, labels, locale, onSignOut}: {authenticated?: boolean; contactHref?: string; labels: MoreMenuLabels; locale: Locale; onSignOut?: () => void}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'primary' | 'appearance'>('primary')
  const [reportOpen, setReportOpen] = useState(false)
  const [sessionState, setSessionState] = useState<boolean | undefined>(authenticated)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const reportTrigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const focusEdge = useRef<'first' | 'last' | null>(null)

  useEffect(() => {
    if (authenticated !== undefined) {
      setSessionState(authenticated)
      return
    }
    let live = true
    void createBrowserAuthActions(locale)
      .then((actions) => actions.getSession())
      .then((session) => { if (live) setSessionState(Boolean(session?.user)) })
      .catch(() => { if (live) setSessionState(false) })
    return () => { live = false }
  }, [authenticated, locale])

  function close() {
    setOpen(false)
    setView('primary')
    trigger.current?.focus()
  }
  function menuItems() {
    return [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])') ?? [])]
  }
  function openMenu(edge: 'first' | 'last' = 'first') {
    focusEdge.current = edge
    setView('primary')
    setOpen(true)
  }
  function showView(next: 'primary' | 'appearance') {
    focusEdge.current = 'first'
    setView(next)
  }
  function closeReport() {
    setReportOpen(false)
    reportTrigger.current?.focus()
  }

  useEffect(() => {
    if (!open || !focusEdge.current || reportOpen) return
    const items = menuItems()
    const target = focusEdge.current === 'last' ? items.at(-1) : items[0]
    focusEdge.current = null
    target?.focus()
  }, [open, reportOpen, sessionState, view])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape' && !reportOpen) close() }
    function onPointerDown(event: MouseEvent) {
      if (!reportOpen && !menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, reportOpen])

  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItems()
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (!items.length) return
    const destination = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : -1
    if (destination >= 0) {
      event.preventDefault()
      items[destination]?.focus()
    }
  }

  async function signOut() {
    try {
      if (onSignOut) onSignOut()
      else {
        const error = await (await createBrowserAuthActions(locale)).signOut()
        if (error) return
      }
      setSessionState(false)
      close()
    } catch { /* Preserve authenticated state when logout was not confirmed. */ }
  }

  const appearance = labels.appearance ?? 'Appearance'
  const back = labels.appearanceBack ?? 'Back'
  const settings = labels.settings ?? 'Settings'
  const contact = labels.contact ?? 'Contact Us'
  const unavailable = labels.contactUnavailable ?? 'Contact is not configured'
  const reportProblem = labels.reportProblem ?? reportFallbacks.reportProblemTitle
  const signOutLabel = labels.signOut ?? 'Sign Out'
  const sessionChecking = labels.sessionChecking ?? 'Checking account…'
  const reportLabels = {...reportFallbacks, ...Object.fromEntries(Object.entries(reportFallbacks).map(([key, fallback]) => [key, labels[key as keyof MoreMenuLabels] ?? fallback]))} as ReportProblemLabels

  return <div className="global-more">
    <button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" aria-label={labels.more} className="more-trigger" onClick={() => open ? close() : openMenu()} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(event.key === 'ArrowUp' ? 'last' : 'first') } }} ref={trigger} type="button"><MoreIcon/><span className="more-trigger-label">{labels.more}</span></button>
    {open ? <div aria-hidden={reportOpen || undefined} aria-label={view === 'appearance' ? appearance : labels.more} className={`global-more-menu${view === 'primary' ? ' global-more-menu--primary' : ' global-more-menu--appearance'}`} id={menuId} onKeyDown={navigateMenu} ref={menu} role="menu">
      {view === 'appearance' ? <>
        <button aria-label={back} className="global-more-back" onClick={() => showView('primary')} role="menuitem" type="button"><span aria-hidden="true">←</span><span>{back}</span></button>
        <div className="global-more-menu-title">{appearance}</div>
        <ThemeControls locale={locale} dark={labels.themeDark ?? 'Dark'} light={labels.themeLight ?? 'Light'} system={labels.themeSystem ?? 'System'} variant="menu"/>
      </> : <>
        <button aria-label={appearance} onClick={() => showView('appearance')} role="menuitem" type="button"><span>{appearance}</span><span aria-hidden="true">›</span></button>
        <Link href={`/${locale}/settings`} onClick={close} role="menuitem">{settings}</Link>
        {contactHref ? <a href={contactHref} onClick={close} role="menuitem">{contact}</a> : <button aria-label={contact} className="global-more-contact-unavailable" disabled role="menuitem" type="button"><span>{contact}</span><span className="global-more-item-note" role="status">{unavailable}</span></button>}
        <button onClick={() => setReportOpen(true)} ref={reportTrigger} role="menuitem" type="button">{reportProblem}</button>
        {sessionState === true ? <button className="global-more-sign-out" onClick={() => void signOut()} role="menuitem" type="button">{signOutLabel}</button> : sessionState === undefined ? <button aria-busy="true" aria-describedby={`${menuId}-session-status`} aria-label={signOutLabel} className="global-more-sign-out global-more-session-checking" disabled role="menuitem" type="button">{signOutLabel}<span className="sr-only" id={`${menuId}-session-status`}>{sessionChecking}</span></button> : null}
      </>}
    </div> : null}
    {reportOpen ? <ReportProblemDialog labels={reportLabels} onClose={closeReport}/> : null}
  </div>
}
