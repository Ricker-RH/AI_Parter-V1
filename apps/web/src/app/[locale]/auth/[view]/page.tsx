import {notFound} from 'next/navigation'
import {connection} from 'next/server'
import {AuthPanel, type AuthMode} from '../../../../components/auth/AuthPanel'
import {isLocale} from '../../../../i18n/config'
import {readWebAuthEnv} from '../../../../lib/auth/env'
import {readAdminReturnTo, readUserReturnTo} from '../../../../lib/auth/return-to'

// The recovery target is request URL data and intentionally remains blocking for now.
export const instant = false

const authModeValues = ['sign-in', 'sign-up', 'forgot-password', 'reset-password'] as const satisfies readonly AuthMode[]
const authModes = new Set<AuthMode>(authModeValues)

export function generateStaticParams() {
  return authModeValues.map((view) => ({view}))
}

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
  await connection()
  const {locale, view} = await params
  if (!isLocale(locale) || !authModes.has(view as AuthMode)) notFound()
  const configuration = readWebAuthEnv(process.env)
  const query = await searchParams
  const resetToken = view === 'reset-password' ? readResetToken(query.token) : undefined
  const returnTo = readAdminReturnTo(locale, query.next) ?? readUserReturnTo(locale, query.next)
  return <AuthPanel
    configured={configuration.status === 'configured'}
    locale={locale}
    mode={view as AuthMode}
    {...(resetToken ? {resetToken} : {})}
    {...(returnTo ? {returnTo} : {})}
  />
}
