import {MyProfilePanel} from '../../../components/profile/MyProfilePanel'
import {notFound} from 'next/navigation'
import {getMessages, isLocale} from '../../../i18n/config'
import {requireAuthenticatedPage} from '../../../lib/auth/access-policy'

export default async function ProfilePage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const access = await requireAuthenticatedPage({locale, returnTo: `/${locale}/profile`})
  const m = await getMessages(locale)
  if (access.status === 'unavailable') return <main><h1 className="sr-only">{m.profile}</h1><section className="empty" role="alert"><p>{m.myProfilePanel.unavailable}</p></section></main>
  return <main><MyProfilePanel labels={m.myProfilePanel} locale={locale} socialLabels={m}/></main>
}
