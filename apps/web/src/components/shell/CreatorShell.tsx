import type {ReactNode} from 'react'
import type {Locale} from '../../i18n/config'
import type {ShellLabels} from '../AppNav'
import {PublicShell} from './PublicShell'

export function CreatorShell({children,labels,locale}: {children: ReactNode;labels:ShellLabels;locale:Locale}) {
  return <div className="creator-shell" data-shell="creator"><PublicShell labels={labels} locale={locale} suppressMobileTopBar>{children}</PublicShell></div>
}
