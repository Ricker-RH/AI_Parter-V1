import {redirect as nextRedirect} from 'next/navigation'
import type {Locale} from '../../i18n/config'
import {authHref} from './return-to'

export type AuthenticatedPageAccess = {status: 'authenticated'; token: string}
export type AnonymousPageAccess = {status: 'anonymous'}
export type UnavailablePageAccess = {status: 'unavailable'}
export type PageAccess = AuthenticatedPageAccess | UnavailablePageAccess
export type OptionalPageAccess = AuthenticatedPageAccess | AnonymousPageAccess | UnavailablePageAccess
export const OPTIONAL_PAGE_ACCESS_TIMEOUT_MS = 250

export function redirectToUserSignIn({locale, returnTo, redirect = nextRedirect}: {locale: Locale; returnTo: string; redirect?: (path: string) => void}): void {
  redirect(authHref(locale, returnTo))
}

export async function getOptionalPageAccess({
  getToken,
  timeoutMs = OPTIONAL_PAGE_ACCESS_TIMEOUT_MS,
}: {
  getToken?: () => Promise<string | null>
  timeoutMs?: number
} = {}): Promise<OptionalPageAccess> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const provider = getToken ?? (async () => {
      const {getApiBearerToken} = await import('./server')
      return getApiBearerToken()
    })
    const outcome = await new Promise<{type: 'token'; token: string | null} | {type: 'failed'} | {type: 'timed-out'}>((resolve) => {
      const token = provider()
      timeout = setTimeout(() => resolve({type: 'timed-out'}), timeoutMs)
      void token.then(
        (value) => resolve({type: 'token', token: value}),
        () => resolve({type: 'failed'}),
      )
    })
    if (outcome.type === 'timed-out') return {status: 'anonymous'}
    if (outcome.type === 'failed') return {status: 'unavailable'}
    const {token} = outcome
    return typeof token === 'string' && token.length > 0 ? {status: 'authenticated', token} : {status: 'anonymous'}
  } catch {
    return {status: 'unavailable'}
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
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
