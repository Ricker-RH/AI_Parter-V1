export type RealtimeIdentity = {subject: string; profileId: string}
export type RealtimeSession = RealtimeIdentity & {sessionId: string; sessionExpiresAt: number}
export type RealtimeAuthorization = RealtimeIdentity & {
  sessionId: string
  conversationId: string
  eventType?: 'message' | 'read' | 'typing' | 'presence' | 'access_revoked'
}
export type RealtimePort = {
  issue(identity: RealtimeIdentity, origin: string): Promise<string>
  redeem(input: {ticket: string; origin: string}): Promise<RealtimeSession>
  /** Must verify durable session identity/expiry, membership, blocks and presence preferences. */
  authorize(input: RealtimeAuthorization): Promise<{allowed: boolean; presenceAllowed: boolean}>
}
