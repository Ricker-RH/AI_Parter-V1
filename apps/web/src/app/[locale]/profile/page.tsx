import {notFound} from 'next/navigation'
import {CachedProfileRoute} from '../../../components/profile/CachedProfileRoute'
import {getMessages, isLocale} from '../../../i18n/config'

export const instant = true

export default async function ProfilePage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  return <main><CachedProfileRoute labels={messages.myProfilePanel} locale={locale} socialLabels={messages}/></main>
}
