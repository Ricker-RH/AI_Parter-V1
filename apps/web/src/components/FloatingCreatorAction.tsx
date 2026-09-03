import Link from 'next/link'
import type {Locale} from '../i18n/config'

export function FloatingCreatorAction({label, locale}: {label: string; locale: Locale}) {
  return <Link aria-label={label} className="floating-creator-action" href={`/${locale}/creator`}><svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></Link>
}
