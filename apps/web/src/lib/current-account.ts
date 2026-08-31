import {AccountSchema, type Account} from '@aifans/contracts'

function serverApiBaseUrl() {
  const configured = process.env.AIFANS_API_URL?.trim()
  return configured ? configured.replace(/\/+$/, '') : null
}

export async function fetchCurrentAccount({cookie}: {cookie?: string | undefined} = {}): Promise<Account | null> {
  const baseUrl = serverApiBaseUrl()
  if (!baseUrl) return null
  try {
    const response = await fetch(`${baseUrl}/v1/me`, {cache: 'no-store', credentials: 'include', ...(cookie ? {headers: {cookie}} : {})})
    if (!response.ok) return null
    const parsed = AccountSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
