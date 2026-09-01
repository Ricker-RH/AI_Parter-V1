import {notFound, redirect} from 'next/navigation'
import {AdminConsole} from '../../../components/admin/AdminConsole'
import {getMessages, isLocale} from '../../../i18n/config'
import {getOperatorPageAccess} from '../../../lib/operator-access'

export const dynamic = 'force-dynamic'

export default async function AdminPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const access = await getOperatorPageAccess()
  if (access === 'anonymous') redirect(`/${locale}/auth/sign-in`)
  if (access !== 'operator') {
    const message = access === 'forbidden' ? messages.admin.operatorRequired : messages.admin.serviceUnavailable
    return <main className="admin-page"><p className="admin-status admin-status-error" role="alert">{message}</p></main>
  }
  return <AdminConsole labels={messages.admin} locale={locale} />
}
