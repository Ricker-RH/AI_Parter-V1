import {notFound, redirect} from 'next/navigation'
import {connection} from 'next/server'
import {AdminConsole} from '../../../components/admin/AdminConsole'
import {getMessages, isLocale} from '../../../i18n/config'
import {getOperatorPageAccess} from '../../../lib/operator-access'

// Authorization is request-scoped and has not been migrated to a streaming boundary.
export const instant = false

export default async function AdminPage({params}: {params: Promise<{locale: string}>}) {
  await connection()
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const access = await getOperatorPageAccess()
  if (access === 'anonymous') redirect(`/${locale}/auth/sign-in?next=${encodeURIComponent(`/${locale}/admin`)}`)
  if (access !== 'operator') {
    const message = access === 'forbidden' ? messages.admin.operatorRequired : messages.admin.serviceUnavailable
    return <main className="admin-page"><p className="admin-status admin-status-error" role="alert">{message}</p></main>
  }
  return <AdminConsole labels={messages.admin} locale={locale} />
}
