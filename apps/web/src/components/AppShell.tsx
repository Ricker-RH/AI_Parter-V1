import type {ReactNode} from 'react'
import type {Locale} from '../i18n/config'
import {AppNav, type ShellLabels} from './AppNav'
import {MobileNav} from './MobileNav'
import {RightRail} from './RightRail'

export function AppShell({locale, labels, children}: {locale: Locale; labels: ShellLabels; children: ReactNode}) {
  const creatorModeEnabled=process.env.CREATOR_MODE_ENABLED!=='false'
  return <div className="shell"><AppNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /><div className="content">{children}</div><RightRail labels={labels} /><MobileNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /></div>
}
