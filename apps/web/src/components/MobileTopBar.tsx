import {AifansSearchIcon, Logo} from '@aifans/ui'
import Link from 'next/link'
import type {Locale} from '../i18n/config'
import {GlobalMoreMenu, type MoreMenuLabels} from './GlobalMoreMenu'

export function MobileTopBar({labels, locale}: {labels: MoreMenuLabels & {search: string}; locale: Locale}) { return <header className="mobile-top-bar"><GlobalMoreMenu labels={labels} locale={locale}/><Link aria-label="AIFANS" className="mobile-brand" href={`/${locale}`}><Logo showWordmark={false} /></Link><Link aria-label={labels.search} className="mobile-search" href={`/${locale}/search`}><AifansSearchIcon aria-hidden="true" className="nav-icon" /></Link></header> }
