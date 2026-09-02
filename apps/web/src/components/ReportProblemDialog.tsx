'use client'

import {useEffect, useRef, type KeyboardEvent} from 'react'

export interface ReportProblemLabels {
  close: string
  reportProblemTitle: string
  reportProblemDescription: string
  reportCategory: string
  reportCategoryBug: string
  reportCategorySafety: string
  reportCategoryOther: string
  reportDetails: string
  reportDetailsPlaceholder: string
  reportContact: string
  reportContactPlaceholder: string
  reportSubmit: string
  reportUnavailable: string
}

const focusableSelector = 'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export function ReportProblemDialog({labels, onClose}: {labels: ReportProblemLabels; onClose: () => void}) {
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
    if (!items.length) return
    const first = items[0]
    const last = items.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return <div className="report-problem-overlay">
    <div aria-labelledby="report-problem-title" aria-modal="true" className="report-problem-dialog" onKeyDown={trapFocus} ref={dialog} role="dialog">
      <button aria-label={labels.close} className="report-problem-close" onClick={onClose} ref={closeButton} type="button">←</button>
      <header className="report-problem-header">
        <h2 id="report-problem-title">{labels.reportProblemTitle}</h2>
        <p>{labels.reportProblemDescription}</p>
      </header>
      <form className="report-problem-form" onSubmit={(event) => event.preventDefault()}>
        <label>{labels.reportCategory}<select defaultValue="bug"><option value="bug">{labels.reportCategoryBug}</option><option value="safety">{labels.reportCategorySafety}</option><option value="other">{labels.reportCategoryOther}</option></select></label>
        <label>{labels.reportDetails}<textarea maxLength={4000} placeholder={labels.reportDetailsPlaceholder} rows={7}/></label>
        <label>{labels.reportContact}<input autoComplete="email" inputMode="email" placeholder={labels.reportContactPlaceholder} type="email"/></label>
        <p className="report-problem-unavailable" role="status">{labels.reportUnavailable}</p>
        <button disabled type="submit">{labels.reportSubmit}</button>
      </form>
    </div>
  </div>
}
