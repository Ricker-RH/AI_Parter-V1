export type WebAuthEnvironment =
  | {status: 'not-configured'}
  | {status: 'configured'; baseUrl: string; cookieSecret: string}

export function readWebAuthEnv(environment: Record<string, string | undefined>): WebAuthEnvironment {
  const baseUrl = environment.NEON_AUTH_BASE_URL?.trim()
  const cookieSecret = environment.NEON_AUTH_COOKIE_SECRET
  if (!baseUrl && !cookieSecret) return {status: 'not-configured'}
  try {
    if (!baseUrl || !cookieSecret || cookieSecret.length < 32 || new URL(baseUrl).protocol !== 'https:') {
      throw new Error()
    }
  } catch {
    throw new Error('Invalid Web auth environment')
  }
  return {status: 'configured', baseUrl, cookieSecret}
}
