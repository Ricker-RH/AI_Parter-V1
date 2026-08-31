import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose'
import type {AuthVerifier, VerifiedIdentity} from '../ports/auth.js'

export type NeonJwtAuthOptions = {
  jwksUrl: string
  issuer: string
  audience: string
  keySet?: JWTVerifyGetKey
}

function bearerToken(request: Request): string | null | undefined {
  const authorization = request.headers.get('authorization')
  if (authorization === null) return undefined
  if (authorization.length > 16_392) return null
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization)
  return match?.[1] ?? null
}

function optionalString(value: unknown): string | null | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function createNeonJwtAuthVerifier(options: NeonJwtAuthOptions): AuthVerifier {
  const keySet = options.keySet ?? createRemoteJWKSet(new URL(options.jwksUrl), {
    timeoutDuration: 3_000,
    cooldownDuration: 30_000,
  })
  return {
    async verify(request) {
      const token = bearerToken(request)
      if (token === undefined) return {status: 'missing'}
      if (token === null) return {status: 'invalid'}
      try {
        const {payload} = await jwtVerify(token, keySet, {
          algorithms: ['ES256', 'RS256', 'EdDSA'],
          issuer: options.issuer,
          audience: options.audience,
          clockTolerance: 5,
        })
        if (typeof payload.sub !== 'string' || !payload.sub.trim()) return {status: 'invalid'}
        const email = optionalString(payload.email)
        const displayName = optionalString(payload.name)
        const identity: VerifiedIdentity = {
          subject: payload.sub,
          ...(email === undefined ? {} : {email}),
          ...(displayName === undefined ? {} : {displayName}),
        }
        return {status: 'authenticated', identity}
      } catch {
        return {status: 'invalid'}
      }
    },
  }
}
