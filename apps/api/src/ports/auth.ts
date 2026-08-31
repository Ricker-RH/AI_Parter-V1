export type VerifiedIdentity = {
  subject: string
  email?: string | null
  displayName?: string | null
}

export type AuthResult =
  | {status: 'missing'}
  | {status: 'invalid'}
  | {status: 'authenticated'; identity: VerifiedIdentity}

export type AuthVerifier = {
  verify(request: Request): Promise<AuthResult>
}
