import {notFound} from 'next/navigation'
import {AuthPanel} from '../../../../components/auth/AuthPanel'
import {isLocale} from '../../../../i18n/config'
import {readWebAuthEnv} from '../../../../lib/auth/env'

export const dynamic = 'force-dynamic'

export default async function AuthPage({params}: {params: Promise<{locale: string; view: string}>}) {
  const {locale, view} = await params
  if (!isLocale(locale) || (view !== 'sign-in' && view !== 'sign-up')) notFound()
  const configuration = readWebAuthEnv(process.env)
  return <AuthPanel configured={configuration.status === 'configured'} locale={locale} mode={view} />
}
