'use client'

import {useLayoutEffect} from 'react'
import {usePathname} from 'next/navigation'
import {resolveShellKind} from './shell/route-shell'

function localeFromPathname(pathname: string) {
  const candidate = pathname.split('/')[1]
  return candidate === 'zh-CN' || candidate === 'en' ? candidate : 'en'
}

export function RootLocaleSync() {
  const pathname = usePathname()
  useLayoutEffect(() => {
    document.documentElement.dataset.profileRoute = String(/^\/(?:en|zh-CN)\/(?:profile\/?|(?:profiles|humans)\/[^/]+\/?)$/.test(pathname))
    document.documentElement.lang = localeFromPathname(pathname)
    document.documentElement.dataset.routeShell = resolveShellKind(pathname)
  }, [pathname])
  return null
}
