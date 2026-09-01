import {createNeonAuth, type NeonAuth} from '@neondatabase/auth/next/server'
import {readWebAuthEnv} from './env'

export function createConfiguredNeonAuth(environment: Record<string, string | undefined> = process.env): NeonAuth | null {
  const configuration = readWebAuthEnv(environment)
  if (configuration.status === 'not-configured') return null
  return createNeonAuth({
    baseUrl: configuration.baseUrl,
    cookies: {secret: configuration.cookieSecret, sessionDataTtl: 300},
    logLevel: 'warn',
  })
}

export async function getApiBearerToken(): Promise<string | null> {
  const auth = createConfiguredNeonAuth()
  if (!auth) return null
  const result = await auth.token()
  if (result.error) throw new Error('Auth token provider unavailable')
  if (!result.data || typeof result.data !== 'object') return null
  const token = (result.data as {token?: unknown}).token
  return typeof token === 'string' && token.length > 0 ? token : null
}
