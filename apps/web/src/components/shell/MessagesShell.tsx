import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {AppNav, type ShellLabels} from '../AppNav'
import {MobileNav} from '../MobileNav'

export function MessagesShell({children, creatorModeEnabled, labels, locale}: {children: ReactNode; creatorModeEnabled: boolean; labels: ShellLabels; locale: Locale}) {
  return <div className="shell messages-shell" data-nav-variant="compact" data-shell="messages"><AppNav compact creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /><div className="content">{children}</div><MobileNav creatorModeEnabled={creatorModeEnabled} labels={labels} locale={locale} /></div>
}
