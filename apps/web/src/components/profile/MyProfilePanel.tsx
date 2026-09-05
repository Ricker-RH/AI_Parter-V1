'use client'
import {ProfileCover} from './ProfileCover'
import coverStyles from './ProfileCover.module.css'

import Link from 'next/link'
import type {CSSProperties} from 'react'
import type {Locale} from '../../i18n/config'
import {Avatar} from '../account/Avatar'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import type {SocialLabels} from '../social/types'
import {MyProfileTabs} from './MyProfileTabs'
import styles from './MyProfilePanel.module.css'
import {PROFILE_BACKGROUND_COLORS} from './ProfileEditor'
import {ProfilePageHeader} from './ProfilePageHeader'

export type MyProfileLabels = {
  loading: string; authRequired: string; signIn: string; unavailable: string; retry: string; emptyBio: string
  edit: string; save: string; saving: string; cancel: string; displayName: string; username: string; bio: string; locale: string
  languageEnglish: string; languageChinese: string; saved: string; saveError: string; invalidName: string; invalidUsername: string
  back:string;search:string;more:string;tabs:string;myIps:string;liked:string;savedTab:string;following:string;loadingSection:string;unavailableSection:string;retrySection:string;myIpsEmpty:string;likedEmpty:string;savedEmpty:string;followingEmpty:string;close?: string
}

export function MyProfilePanel({labels, locale, socialLabels, viewerScope}: {labels: MyProfileLabels; locale: Locale; socialLabels?: SocialLabels; viewerScope?: string}) {
  const {account, loading, refetch, status} = useCurrentAccount()

  if (loading || status === 'loading') return <section className={styles.state} role="status">{labels.loading}</section>
  if (status === 'anonymous') return <section className={styles.state} role="alert"><p>{labels.authRequired}</p><Link href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link></section>
  if (status === 'unavailable') return <section className={styles.state} role="alert"><p>{labels.unavailable}</p><button onClick={() => void refetch()} type="button">{labels.retry}</button></section>
  if (!account) return <section className={styles.state} role="alert"><p>{labels.authRequired}</p><Link href={`/${locale}/auth/sign-in`}>{labels.signIn}</Link></section>

  const profilePath = `/${locale}/profile`
  const backgroundStyle = account.background.type === 'image'
    ? {
        '--profile-background-image': `url("${account.background.url}")`,
        '--profile-background-focal-x': `${account.background.focalX * 100}%`,
        '--profile-background-focal-y': `${account.background.focalY * 100}%`,
      } as CSSProperties
    : {'--profile-background-color': PROFILE_BACKGROUND_COLORS[account.background.colorKey]} as CSSProperties

  return <div className={styles.page}><div className={`${styles.pageContent} ${coverStyles.host}`} style={account.background.type === 'color' ? {'--profile-foreground': account.background.colorKey === 'graphite' ? PROFILE_BACKGROUND_COLORS.paper : PROFILE_BACKGROUND_COLORS.graphite} as CSSProperties : undefined}>
  <ProfilePageHeader backHref={`/${locale}`} labels={labels} locale={locale} username={account.username}/>
    <div className={styles.surface} data-profile-content-frame data-profile-cover-surface>
      <div className={styles.profileBody}>
        <section className={styles.profile} aria-labelledby="my-profile-title" data-background-type={account.background.type} style={account.background.type === 'color' ? {'--profile-foreground': account.background.colorKey === 'graphite' ? PROFILE_BACKGROUND_COLORS.paper : PROFILE_BACKGROUND_COLORS.graphite} as CSSProperties : undefined}>
          <header className={styles.identityRow}><div className={styles.identityCopy}><h2 id="my-profile-title">{account.displayName}</h2><p>@{account.username}</p></div><Avatar avatarUrl={account.avatarUrl ?? null} className={styles.avatar!} displayName={account.displayName} size="large"/></header>
          <div className={styles.details}><p className={styles.bio}>{account.bio || <span className={styles.empty}>{labels.emptyBio}</span>}</p></div>
          <Link className={styles.editAction} href={`/${locale}/profile/edit?returnTo=${encodeURIComponent(profilePath)}`}>{labels.edit}</Link>
        </section>
        <MyProfileTabs labels={{tabs:labels.tabs,myIps:labels.myIps,liked:labels.liked,saved:labels.savedTab,following:labels.following,loadingSection:labels.loadingSection,authRequired:labels.authRequired,signIn:labels.signIn,unavailableSection:labels.unavailableSection,retrySection:labels.retrySection,myIpsEmpty:labels.myIpsEmpty,likedEmpty:labels.likedEmpty,savedEmpty:labels.savedEmpty,followingEmpty:labels.followingEmpty}} locale={locale} socialLabels={socialLabels??({} as SocialLabels)} {...(viewerScope ? {viewerScope} : {})}/>
      </div>
    </div>
    <ProfileCover backgroundStyle={backgroundStyle} type={account.background.type}/>
  </div></div>
}
