import type {ReactNode} from 'react'
import type {Locale} from '../i18n/config'
import {AppNav, type ShellLabels} from './AppNav'
import {MobileNav} from './MobileNav'
import {RightRail} from './RightRail'

export function AppShell({locale, labels, children}: {locale: Locale; labels: ShellLabels; children: ReactNode}) {
  return <div className="shell"><AppNav labels={labels} locale={locale} /><div className="content">{children}</div><RightRail labels={labels} /><MobileNav labels={labels} locale={locale} /></div>
}
