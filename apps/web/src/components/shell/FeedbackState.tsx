import type {ReactNode} from 'react'

export function FeedbackState({title, description, children}: {title: string; description?: string; children?: ReactNode}) {
  return <section className="feedback-state" role="alert">
    <svg className="feedback-state__art" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="42" fill="currentColor" opacity=".035"/>
      <rect x="23" y="20" width="50" height="56" rx="13" stroke="currentColor" strokeWidth="1.5" opacity=".25"/>
      <path d="M35 44a14 14 0 0 1 24-8l4 4m0-10v10H53M61 53a14 14 0 0 1-24 8l-4-4m0 10V57h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <h2>{title}</h2>{description ? <p>{description}</p> : null}
    {children ? <div className="feedback-state__actions">{children}</div> : null}
  </section>
}
