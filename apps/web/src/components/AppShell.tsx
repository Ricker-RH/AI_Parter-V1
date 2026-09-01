import type {ReactNode} from 'react'
import type {Locale} from '../i18n/config'
import {AppNav, type ShellLabels} from './AppNav'
import {MobileNav} from './MobileNav'
import {RightRail} from './RightRail'
import {isCreatorModeEnabled} from '../lib/creator-mode'

export function AppShell({locale, labels, children}: {locale: Locale; labels: ShellLabels; children: ReactNode}) {
  const creatorModeEnabled=isCreatorModeEnabled()
  return <div className="shell"><AppNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /><div className="content">{children}</div><RightRail labels={labels} /><MobileNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /></div>
}
