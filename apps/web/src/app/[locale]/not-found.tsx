'use client'

import {Logo} from '@aifans/ui'
import Link from 'next/link'
import {usePathname} from 'next/navigation'

const copy = {
  en: {title: 'Page not found', description: 'The page may have moved or is no longer available.', home: 'Return home'},
  'zh-CN': {title: '找不到页面', description: '这个页面可能已移动，或暂时不可用。', home: '返回首页'},
} as const

export default function NotFound() {
  const pathname = usePathname()
  const locale = pathname.startsWith('/zh-CN') ? 'zh-CN' : 'en'
  const labels = copy[locale]
  return <main className="route-not-found"><Logo className="route-not-found-mark" showWordmark={false}/><p aria-hidden="true" className="route-not-found-code">404</p><h1>{labels.title}</h1><p>{labels.description}</p><Link href={`/${locale}`}>{labels.home}</Link></main>
}
