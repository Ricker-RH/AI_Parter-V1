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
  onVerification?: (event: {status: 'missing' | 'invalid' | 'authenticated'; code?: string; claim?: string; actual?: string}) => void
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
      if (token === undefined) {
        options.onVerification?.({status: 'missing'})
        return {status: 'missing'}
      }
      if (token === null) {
        options.onVerification?.({status: 'invalid', code: 'MALFORMED_BEARER'})
        return {status: 'invalid'}
      }
      try {
        const {payload} = await jwtVerify(token, keySet, {
          algorithms: ['ES256', 'RS256', 'EdDSA'],
          issuer: options.issuer,
          audience: options.audience,
          requiredClaims: ['exp'],
          clockTolerance: 5,
        })
        if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
          options.onVerification?.({status: 'invalid', code: 'MISSING_SUBJECT'})
          return {status: 'invalid'}
        }
        const email = optionalString(payload.email)
        const displayName = optionalString(payload.name)
        const identity: VerifiedIdentity = {
          subject: payload.sub,
          ...(email === undefined ? {} : {email}),
          ...(displayName === undefined ? {} : {displayName}),
        }
        options.onVerification?.({status: 'authenticated'})
        return {status: 'authenticated', identity}
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'JWT_VERIFICATION_FAILED'
        const claim = error && typeof error === 'object' && 'claim' in error && typeof error.claim === 'string'
          ? error.claim
          : undefined
        const payload = error && typeof error === 'object' && 'payload' in error && error.payload && typeof error.payload === 'object'
          ? error.payload as Record<string, unknown>
          : undefined
        const actualClaim = claim && (claim === 'iss' || claim === 'aud') && typeof payload?.[claim] === 'string'
          ? payload[claim].slice(0, 500)
          : undefined
        options.onVerification?.({
          status: 'invalid',
          code,
          ...(claim === undefined ? {} : {claim}),
          ...(actualClaim === undefined ? {} : {actual: actualClaim}),
        })
        return {status: 'invalid'}
      }
    },
  }
}
