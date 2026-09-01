import {notFound} from 'next/navigation'
import {AuthPanel, type AuthMode} from '../../../../components/auth/AuthPanel'
import {isLocale} from '../../../../i18n/config'
import {readWebAuthEnv} from '../../../../lib/auth/env'
import {readAdminReturnTo} from '../../../../lib/auth/return-to'

export const dynamic = 'force-dynamic'

const authModes = new Set<AuthMode>(['sign-in', 'sign-up', 'forgot-password', 'reset-password'])

export function readResetToken(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length >= 16 && value.length <= 2048 && /^[A-Za-z0-9._~-]+$/.test(value)
    ? value
    : undefined
}

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{locale: string; view: string}>
  searchParams: Promise<{token?: string | string[]; next?: string | string[]}>
}) {
  const {locale, view} = await params
  if (!isLocale(locale) || !authModes.has(view as AuthMode)) notFound()
  const configuration = readWebAuthEnv(process.env)
  const query = await searchParams
  const resetToken = view === 'reset-password' ? readResetToken(query.token) : undefined
  const returnTo = readAdminReturnTo(locale, query.next)
  return <AuthPanel
    configured={configuration.status === 'configured'}
    locale={locale}
    mode={view as AuthMode}
    {...(resetToken ? {resetToken} : {})}
    {...(returnTo ? {returnTo} : {})}
  />
}
