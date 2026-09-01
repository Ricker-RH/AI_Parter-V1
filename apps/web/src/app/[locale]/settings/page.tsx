import Link from 'next/link'
import {ThemeControls} from '../../../components/ThemeProvider'
import {AuthAccountControl} from '../../../components/auth/AuthAccountControl'
import {isLocale} from '../../../i18n/config'
import {readWebAuthEnv} from '../../../lib/auth/env'
import {pageMessages} from '../../page-messages'
export default async function SettingsPage({params}: {params: Promise<{locale: string}>}) { const m = await pageMessages(params); const {locale} = await params; if (!isLocale(locale)) return null; const auth = readWebAuthEnv(process.env); return <main><header className="page-header"><h1 className="page-title">{m.settings}</h1></header><div className="settings"><AuthAccountControl configured={auth.status === 'configured'} locale={locale} /><section className="settings-section"><h2>{m.settingsLanguageTitle}</h2><p>{m.settingsLanguageDescription}</p><div className="choice-row"><Link className="choice" href="/en">{m.languageEnglish}</Link><Link className="choice" href="/zh-CN">{m.languageChinese}</Link></div></section><section className="settings-section" id="appearance"><h2>{m.settingsThemeTitle}</h2><p>{m.settingsThemeDescription}</p><ThemeControls dark={m.themeDark} light={m.themeLight} system={m.themeSystem} /></section></div></main> }
