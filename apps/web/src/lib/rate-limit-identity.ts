import {createHmac} from 'node:crypto'
import {isIP} from 'node:net'

export function requireWebRateLimitIdentitySecret(environment: Record<string, string | undefined>): string {
  const secret = environment.WEB_API_RATE_LIMIT_SIGNING_SECRET
  if (!secret || secret.length < 32 || /^(.)\1+$/.test(secret) || /(?:^|[-_])(change(?:me)?|replace(?:me)?|example|placeholder|test|your[-_]?secret)(?:[-_]|$)/i.test(secret)) {
    throw new Error('Invalid Web rate limit environment')
  }
  return secret
}

function firstTrustedAddress(headers: Headers): string | null {
  for (const value of headers.get('x-vercel-forwarded-for')?.split(',') ?? []) {
    const address = value.trim()
    if (address && isIP(address)) return address
  }
  return null
}

export function createRateLimitIdentity(headers: Headers, nowMs: number, secret: string | undefined): string | null {
  const address = firstTrustedAddress(headers)
  if (!address || !secret || secret.length < 32) return null
  const epochMinute = Math.floor(nowMs / 60_000)
  const clientHash = createHmac('sha256', secret).update(address).digest('hex')
  const unsigned = `v1.${epochMinute}.${clientHash}`
  const signature = createHmac('sha256', secret).update(unsigned).digest('hex')
  return `${unsigned}.${signature}`
}
