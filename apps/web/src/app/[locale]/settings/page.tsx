import {connection} from 'next/server'
import {SettingsContent} from '../../../components/settings/SettingsContent'
import {getMessages, isLocale} from '../../../i18n/config'
import {requireAuthenticatedPage} from '../../../lib/auth/access-policy'
import {readWebAuthEnv} from '../../../lib/auth/env'
import styles from './SettingsPage.module.css'

export const instant = false

export default async function SettingsPage({params}: {params: Promise<{locale: string}>}) {
  await connection()
  const {locale} = await params
  if (!isLocale(locale)) return null

  const access = await requireAuthenticatedPage({locale, returnTo: `/${locale}/settings`})
  const m = await getMessages(locale)
  if (access.status === 'unavailable') {
    return <main><header className="page-header"><h1 className="page-title">{m.settings}</h1></header><section className={styles.unavailable} role="alert"><p>{m.unavailableDescription}</p></section></main>
  }

  const auth = readWebAuthEnv(process.env)
  return <main><header className="page-header"><h1 className="page-title">{m.settings}</h1></header><SettingsContent configured={auth.status === 'configured'} locale={locale}/></main>
}
