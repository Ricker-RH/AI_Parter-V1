'use client'

import {useEffect, useRef} from 'react'
import {useRouter} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import {MyProfilePanel, type MyProfileLabels} from './MyProfilePanel'
import type {SocialLabels} from '../social/types'

export function CachedProfileRoute({labels,locale,socialLabels}:{labels:MyProfileLabels;locale:Locale;socialLabels:SocialLabels}){
  const {account,status}=useCurrentAccount()
  const router=useRouter()
  const redirected=useRef(false)
  useEffect(()=>{
    if(status!=='anonymous'||redirected.current)return
    redirected.current=true
    router.replace(authHref(locale,`/${locale}/profile`))
  },[locale,router,status])
  const viewerScope=account?`${account.kind}:${account.id}`:undefined
  return <MyProfilePanel labels={labels} locale={locale} socialLabels={socialLabels} {...(viewerScope?{viewerScope}:{})}/>
}
