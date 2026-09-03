import Link from 'next/link'
import type {Locale} from '../i18n/config'
import {creatorHref} from '../lib/auth/return-to'

export function FloatingCreatorAction({label, locale, returnTo}: {label: string; locale: Locale; returnTo: string}) {
  return <Link aria-label={label} className="floating-creator-action" href={creatorHref(locale, returnTo)}><svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></Link>
}
