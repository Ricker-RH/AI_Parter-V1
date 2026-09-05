import Link from 'next/link'
import {connection} from 'next/server'
import {ThemeControls} from '../../../components/ThemeProvider'
import {AuthAccountControl} from '../../../components/auth/AuthAccountControl'
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
  return <main><header className="page-header"><h1 className="page-title">{m.settings}</h1></header><div className={styles.settings}><div className={styles.list}><AuthAccountControl configured={auth.status === 'configured'} locale={locale} /><section className="settings-section"><h2>{m.settingsLanguageTitle}</h2><p>{m.settingsLanguageDescription}</p><div className="choice-row"><Link className="choice" href="/en">{m.languageEnglish}</Link><Link className="choice" href="/zh-CN">{m.languageChinese}</Link></div></section><section className="settings-section" id="appearance"><h2>{m.settingsThemeTitle}</h2><p>{m.settingsThemeDescription}</p><ThemeControls locale={locale} dark={m.themeDark} light={m.themeLight} system={m.themeSystem} /></section></div></div></main>
}
