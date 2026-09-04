import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import {AppNav, type ShellLabels} from '../AppNav'
import {MobileNav} from '../MobileNav'
import {MobileTopBar} from '../MobileTopBar'
import {RightRail} from '../RightRail'

export function PublicShell({children, floatingCreatorAction, labels, locale, suppressMobileTopBar=false, suppressMobileNav=false}: {children: ReactNode; floatingCreatorAction?: ReactNode; labels: ShellLabels; locale: Locale; suppressMobileTopBar?: boolean; suppressMobileNav?: boolean}) {
  return <div className="shell" data-floating-creator-action={floatingCreatorAction ? 'visible' : undefined} data-layout="fluid" data-mobile-nav={suppressMobileNav ? 'hidden' : 'visible'} data-mobile-top-bar={suppressMobileTopBar ? 'hidden' : 'visible'} data-shell="public"><AppNav labels={labels} locale={locale} /><div className="content">{suppressMobileTopBar ? null : <MobileTopBar labels={labels} locale={locale}/>} {children}{floatingCreatorAction}</div><RightRail labels={labels} />{suppressMobileNav ? null : <MobileNav labels={labels} locale={locale} />}</div>
}
