import {notFound} from 'next/navigation'
import {AdminConsole} from '../../../components/admin/AdminConsole'
import {getMessages, isLocale} from '../../../i18n/config'

export default async function AdminPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  return <AdminConsole labels={messages.admin} locale={locale} />
}
