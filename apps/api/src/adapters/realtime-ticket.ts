import {SignJWT, jwtVerify} from 'jose'
import {z} from 'zod'

const TICKET_TTL_SECONDS = 60
const SESSION_TTL_SECONDS = 300
const IdentitySchema = z.strictObject({
  subject: z.string().trim().min(1).max(512),
  profileId: z.uuid(),
  origin: z.string().url(),
})

export type RealtimeTicketOptions = {
  secret: string
  issuer: string
  audience: string
  allowedOrigins: string[]
  now?: () => number
  /** Atomically create the session keyed by jti, retaining replay protection until expiry. */
  consume: (jti: string, expiresAt: number, identity: {subject: string; profileId: string}, sessionExpiresAt: number, ticketIssuedAt: number) => Promise<boolean>
}

export function createRealtimeTickets(options: RealtimeTicketOptions) {
  if (new TextEncoder().encode(options.secret).length < 32 || options.secret.trim()!==options.secret || !options.issuer.trim() || !options.audience.trim()) {
    throw new Error('INVALID_REALTIME_CONFIGURATION')
  }
  const origins = new Set(options.allowedOrigins)
  if (!origins.size || [...origins].some((value) => {
    try { const url = new URL(value); return url.protocol !== 'https:' || url.origin !== value }
    catch { return true }
  })) throw new Error('INVALID_REALTIME_CONFIGURATION')
  const key = new TextEncoder().encode(options.secret)
  const now = options.now ?? (() => Math.floor(Date.now() / 1000))

  return {
    async issue(input: z.infer<typeof IdentitySchema>): Promise<string> {
      const identity = IdentitySchema.parse(input)
      if (!origins.has(identity.origin)) throw new Error('INVALID_REALTIME_ORIGIN')
      const issuedAt = now()
      return new SignJWT({profileId: identity.profileId, origin: identity.origin})
        .setProtectedHeader({alg: 'HS256', typ: 'JWT'})
        .setSubject(identity.subject).setIssuer(options.issuer).setAudience(options.audience)
        .setJti(crypto.randomUUID()).setIssuedAt(issuedAt).setExpirationTime(issuedAt + TICKET_TTL_SECONDS)
        .sign(key)
    },
    async consume(ticket: string, origin: string): Promise<{subject: string; profileId: string; sessionId: string; sessionExpiresAt: number}> {
      try {
        if (!origins.has(origin) || typeof ticket !== 'string' || ticket.length > 4096) throw new Error()
        const time = now()
        const {payload} = await jwtVerify(ticket, key, {
          issuer: options.issuer, audience: options.audience, algorithms: ['HS256'], typ: 'JWT',
          currentDate: new Date(time * 1000), maxTokenAge: TICKET_TTL_SECONDS,
          requiredClaims: ['sub', 'jti', 'iat', 'exp'],
        })
        const identity = IdentitySchema.parse({subject: payload.sub, profileId: payload.profileId, origin: payload.origin})
        const id = z.uuid().parse(payload.jti)
        if (identity.origin !== origin || !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) ||
          payload.iat! > time || payload.exp! - payload.iat! > TICKET_TTL_SECONDS || payload.exp! <= time) throw new Error()
        const sessionExpiresAt = (time + SESSION_TTL_SECONDS) * 1000
        const sessionIdentity = {subject: identity.subject, profileId: identity.profileId}
        if (!await options.consume(id, payload.exp!, sessionIdentity, sessionExpiresAt, payload.iat! * 1000)) throw new Error()
        return {...sessionIdentity, sessionId: id, sessionExpiresAt}
      } catch {
        // Do not leak tokens, verifier internals, or replay-store errors to callers/logs.
        throw new Error('INVALID_REALTIME_TICKET')
      }
    },
  }
}
