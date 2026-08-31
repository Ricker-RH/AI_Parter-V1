import {AccountSchema, type Account} from '@aifans/contracts'
import {fetchAifansApi} from './server-api'

export const CURRENT_ACCOUNT_TIMEOUT_MS = 1500
export type CurrentAccountResult = {status: 'authenticated'; account: Account} | {status: 'anonymous'} | {status: 'unavailable'}

export async function fetchCurrentAccountResult({cookie, timeoutMs = CURRENT_ACCOUNT_TIMEOUT_MS}: {cookie?: string | undefined; timeoutMs?: number | undefined} = {}): Promise<CurrentAccountResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchAifansApi('/v1/me', {requestInit: {signal: controller.signal}})
    if (response.status === 401 || response.status === 204) return {status: 'anonymous'}
    if (!response.ok) return {status: 'unavailable'}
    const parsed = AccountSchema.strict().safeParse(await response.json())
    return parsed.success ? {status: 'authenticated', account: parsed.data} : {status: 'unavailable'}
  } catch {
    return {status: 'unavailable'}
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchCurrentAccount(options: {cookie?: string | undefined; timeoutMs?: number | undefined} = {}): Promise<Account | null> {
  const result = await fetchCurrentAccountResult(options)
  return result.status === 'authenticated' ? result.account : null
}
