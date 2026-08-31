import {AccountSchema, type Account} from '@aifans/contracts'

function serverApiBaseUrl() {
  const configured = process.env.AIFANS_API_URL?.trim()
  return configured ? configured.replace(/\/+$/, '') : null
}

export const CURRENT_ACCOUNT_TIMEOUT_MS = 1500

export async function fetchCurrentAccount({cookie, timeoutMs = CURRENT_ACCOUNT_TIMEOUT_MS}: {cookie?: string | undefined; timeoutMs?: number | undefined} = {}): Promise<Account | null> {
  const baseUrl = serverApiBaseUrl()
  if (!baseUrl) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/v1/me`, {cache: 'no-store', credentials: 'include', signal: controller.signal, ...(cookie ? {headers: {cookie}} : {})})
    if (!response.ok) return null
    const parsed = AccountSchema.strict().safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
