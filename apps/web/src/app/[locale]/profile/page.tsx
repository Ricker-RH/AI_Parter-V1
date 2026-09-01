import {MyProfilePanel} from '../../../components/profile/MyProfilePanel'
import {notFound} from 'next/navigation'
import {getMessages, isLocale} from '../../../i18n/config'

export default async function ProfilePage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const m = await getMessages(locale)
  return <main><header className="page-header"><h1 className="page-title">{m.profile}</h1></header><MyProfilePanel labels={m.myProfilePanel} locale={locale}/></main>
}
