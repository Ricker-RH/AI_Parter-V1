import type {Locale} from '../i18n/config'

export type NavigationDestination = {key: string; href: string}

export function isNavigationActive(item: NavigationDestination, locale: Locale, pathname: string, following?: boolean): boolean {
  const href = `/${locale}${item.href}`
  if (item.key === 'following') return pathname === `/${locale}` && following === true
  if (item.key === 'forYou') return pathname === `/${locale}` && following !== true
  if (item.key === 'messages') return pathname === href || pathname.startsWith(`${href}/`) || pathname === `/${locale}/notifications`
  if (item.key === 'channels') return pathname === href || pathname.startsWith(`${href}/`)
  return pathname === href
}
