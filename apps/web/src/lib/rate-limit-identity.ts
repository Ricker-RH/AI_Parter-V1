import {createHmac} from 'node:crypto'
import {isIP} from 'node:net'

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
