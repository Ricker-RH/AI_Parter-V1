import {redirect as nextRedirect} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {authHref} from './return-to'

export type AuthenticatedPageAccess = {status: 'authenticated'; token: string}
export type UnavailablePageAccess = {status: 'unavailable'}
export type PageAccess = AuthenticatedPageAccess | UnavailablePageAccess

export function redirectToUserSignIn({locale, returnTo, redirect = nextRedirect}: {locale: Locale; returnTo: string; redirect?: (path: string) => void}): void {
  redirect(authHref(locale, returnTo))
}

export async function requireAuthenticatedPage({
  locale,
  returnTo,
  getToken,
  redirect = nextRedirect,
}: {
  locale: Locale
  returnTo: string
  getToken?: () => Promise<string | null>
  redirect?: (path: string) => void
}): Promise<PageAccess> {
  let token: string | null
  try {
    const provider = getToken ?? (async () => {
      const {getApiBearerToken} = await import('./server')
      return getApiBearerToken()
    })
    token = await provider()
  } catch {
    return {status: 'unavailable'}
  }
  if (typeof token === 'string' && token.length > 0) return {status: 'authenticated', token}

  redirectToUserSignIn({locale, returnTo, redirect})
  return {status: 'unavailable'}
}
