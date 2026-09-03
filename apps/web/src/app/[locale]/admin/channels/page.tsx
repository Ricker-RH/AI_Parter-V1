import {notFound, redirect} from 'next/navigation'
import {connection} from 'next/server'
import {AdminChannels} from '../../../../components/admin/AdminChannels'
import {getMessages, isLocale} from '../../../../i18n/config'
import {getOperatorPageAccess} from '../../../../lib/operator-access'

export const instant = false

export default async function AdminChannelsPage({params}: {params: Promise<{locale: string}>}) {
  await connection()
  const {locale} = await params
  if (!isLocale(locale)) notFound()
  const messages = await getMessages(locale)
  const access = await getOperatorPageAccess()
  if (access === 'anonymous') redirect(`/${locale}/auth/sign-in?next=${encodeURIComponent(`/${locale}/admin/channels`)}`)
  if (access !== 'operator') return <main className="admin-page"><p className="admin-status admin-status-error" role="alert">{access === 'forbidden' ? messages.admin.operatorRequired : messages.admin.serviceUnavailable}</p></main>
  return <AdminChannels labels={messages.adminChannels} />
}
