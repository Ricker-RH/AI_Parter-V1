import {AccountSchema, type Account} from '@aifans/contracts'
import {fetchAifansApi} from './server-api'

export const CURRENT_ACCOUNT_TIMEOUT_MS = 1500
export type CurrentAccountResult = {status: 'authenticated'; account: Account} | {status: 'anonymous'} | {status: 'auth-required'} | {status: 'unavailable'}

function unavailable(reason: 'timeout' | 'transport' | 'http' | 'json' | 'schema'): CurrentAccountResult {
  // Never include response bodies, schema values, account identifiers or credentials.
  console.warn('current_account_unavailable', {reason})
  return {status:'unavailable'}
}

export async function fetchCurrentAccountResult({cookie, timeoutMs = CURRENT_ACCOUNT_TIMEOUT_MS, token}: {cookie?: string | undefined; timeoutMs?: number | undefined; token?: string | undefined} = {}): Promise<CurrentAccountResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchAifansApi('/v1/me', {policy: 'private-cache', requestInit: {signal: controller.signal}, ...(token ? {getToken: async () => token} : {})})
    if (response.status === 401) return {status: 'auth-required'}
    if (response.status === 204) return {status: 'anonymous'}
    if (!response.ok) return unavailable('http')
    let body: unknown
    try {body = await response.json()} catch {return unavailable(controller.signal.aborted ? 'timeout' : 'json')}
    const parsed = AccountSchema.strict().safeParse(body)
    return parsed.success ? {status: 'authenticated', account: parsed.data} : unavailable('schema')
  } catch {
    return unavailable(controller.signal.aborted ? 'timeout' : 'transport')
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchCurrentAccount(options: {cookie?: string | undefined; timeoutMs?: number | undefined; token?: string | undefined} = {}): Promise<Account | null> {
  const result = await fetchCurrentAccountResult(options)
  return result.status === 'authenticated' ? result.account : null
}
