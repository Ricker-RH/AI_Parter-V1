import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {AppNav, type ShellLabels} from '../AppNav'
import {MobileNav} from '../MobileNav'
import {MobileTopBar} from '../MobileTopBar'

export function MessagesShell({activeChat = false, children, floatingCreatorAction, labels, locale}: {activeChat?: boolean; children: ReactNode; floatingCreatorAction?: ReactNode; labels: ShellLabels; locale: Locale}) {
  return <div className="shell messages-shell" data-active-chat={activeChat ? 'true' : 'false'} data-floating-creator-action={floatingCreatorAction ? 'visible' : undefined} data-mobile-top-bar="hidden" data-nav-variant="compact" data-shell="messages"><AppNav compact labels={labels} locale={locale} /><div className="content"><MobileTopBar labels={labels} locale={locale}/>{children}{floatingCreatorAction}</div><MobileNav labels={labels} locale={locale} /></div>
}
