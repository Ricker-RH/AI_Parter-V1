import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {AppNav, type ShellLabels} from '../AppNav'
import {MobileNav} from '../MobileNav'
import {MobileTopBar} from '../MobileTopBar'

export function MessagesShell({children, creatorModeEnabled, labels, locale}: {children: ReactNode; creatorModeEnabled: boolean; labels: ShellLabels; locale: Locale}) {
  return <div className="shell messages-shell" data-nav-variant="compact" data-shell="messages"><AppNav compact creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /><div className="content"><MobileTopBar labels={labels} locale={locale}/>{children}</div><MobileNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /></div>
}
