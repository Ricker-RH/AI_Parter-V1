import {notFound} from 'next/navigation'
import {connection} from 'next/server'
import {ProfileEditor} from '../../../../components/profile/ProfileEditor'
import {getMessages, isLocale, type Locale} from '../../../../i18n/config'
import {requireAuthenticatedPage} from '../../../../lib/auth/access-policy'

export const instant = false

type SearchParams = {returnTo?: string | string[]}

export function validatedProfileReturnTo(locale: Locale, value: unknown): string {
  const fallback = `/${locale}/profile`
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  try {
    const parsed = new URL(value, 'https://aifans.local')
    const localeRoot = `/${locale}`
    if (parsed.origin !== 'https://aifans.local') return fallback
    if (parsed.pathname !== localeRoot && !parsed.pathname.startsWith(`${localeRoot}/`)) return fallback
    return value
  } catch {
    return fallback
  }
}

export default async function EditProfilePage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<SearchParams>}) {
  await connection()
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const query = await searchParams
  const returnTo = validatedProfileReturnTo(locale, query.returnTo)
  const editReturnTo = query.returnTo === returnTo
    ? `/${locale}/profile/edit?returnTo=${encodeURIComponent(returnTo)}`
    : `/${locale}/profile/edit`
  const access = await requireAuthenticatedPage({locale, returnTo: editReturnTo})
  const messages = await getMessages(locale)
  if (access.status === 'unavailable') {
    return <main><h1 className="sr-only">{messages.profileEditor.title}</h1><section className="empty" role="alert"><p>{messages.myProfilePanel.unavailable}</p></section></main>
  }
  return <main><ProfileEditor labels={messages.profileEditor} locale={locale} returnTo={returnTo}/></main>
}
