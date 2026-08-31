export const locales = ['en', 'zh-CN'] as const

export type Locale = (typeof locales)[number]

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale)
}

export async function getMessages(locale: Locale) {
  return (await import(`../../messages/${locale}.json`)).default
}
