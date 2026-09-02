import type {Locale} from '../i18n/config'

const units = {
  en: {minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y', now: 'now'},
  'zh-CN': {minute: '分钟', hour: '小时', day: '天', week: '周', month: '个月', year: '年', now: '刚刚'},
} as const

export function formatRelativeDuration(value: string, locale: Locale, now = Date.now()) {
  const publishedAt = Date.parse(value)
  const elapsedSeconds = Math.floor((now - publishedAt) / 1000)
  const labels = units[locale]

  if (!Number.isFinite(publishedAt) || elapsedSeconds < 60) return labels.now
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}${labels.minute}`
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}${labels.hour}`
  if (elapsedSeconds < 604_800) return `${Math.floor(elapsedSeconds / 86_400)}${labels.day}`
  if (elapsedSeconds < 2_592_000) return `${Math.floor(elapsedSeconds / 604_800)}${labels.week}`
  if (elapsedSeconds < 31_536_000) return `${Math.floor(elapsedSeconds / 2_592_000)}${labels.month}`
  return `${Math.floor(elapsedSeconds / 31_536_000)}${labels.year}`
}
