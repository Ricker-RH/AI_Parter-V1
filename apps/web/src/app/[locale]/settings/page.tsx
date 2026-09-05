import Link from 'next/link'
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
    return <main className={styles.page}><header className={styles.header}><Link aria-label={locale==='zh-CN'?'返回':'Back'} href={`/${locale}/profile`}>‹</Link><h1>{m.settings}</h1></header><section className={styles.unavailable} role="alert"><p>{m.unavailableDescription}</p></section></main>
  }

  const auth = readWebAuthEnv(process.env)
  return <main className={styles.page}><header className={styles.header}><Link aria-label={locale==='zh-CN'?'返回':'Back'} href={`/${locale}/profile`}>‹</Link><h1>{m.settings}</h1></header><div className={styles.scroller}><SettingsContent configured={auth.status === 'configured'} locale={locale}/></div></main>
}
