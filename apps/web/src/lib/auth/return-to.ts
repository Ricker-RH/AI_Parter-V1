import type {Locale} from '../../i18n/config'

export function readAdminReturnTo(locale: Locale, value: string | readonly string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const allowed = new Set([`/${locale}/admin`, `/${locale}/admin/creator`])
  return allowed.has(value) ? value : undefined
}
