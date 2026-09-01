import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {AppNav, type ShellLabels} from '../AppNav'
import {MobileNav} from '../MobileNav'
import {MobileTopBar} from '../MobileTopBar'
import {RightRail} from '../RightRail'

export function PublicShell({children, creatorModeEnabled, labels, locale}: {children: ReactNode; creatorModeEnabled: boolean; labels: ShellLabels; locale: Locale}) {
  return <div className="shell" data-shell="public"><AppNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /><div className="content"><MobileTopBar labels={labels} locale={locale}/>{children}</div><RightRail labels={labels} /><MobileNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /></div>
}
