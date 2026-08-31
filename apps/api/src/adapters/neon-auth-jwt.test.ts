import {describe, expect, it} from 'vitest'
import {exportJWK, generateKeyPair, SignJWT, createLocalJWKSet} from 'jose'
import {createNeonJwtAuthVerifier} from './neon-auth-jwt.js'

async function fixture() {
  const {privateKey, publicKey} = await generateKeyPair('ES256')
  const jwk = await exportJWK(publicKey)
  const issuer = 'https://auth.example'
  const audience = 'aifans-api'
  const verifier = createNeonJwtAuthVerifier({
    audience,
    issuer,
    jwksUrl: 'https://auth.example/.well-known/jwks.json',
    keySet: createLocalJWKSet({keys: [{...jwk, alg: 'ES256', kid: 'test-key', use: 'sig'}]}),
  })
  const token = await new SignJWT({email: 'luna@example.com', name: 'Luna'})
    .setProtectedHeader({alg: 'ES256', kid: 'test-key'})
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('neon-user-1')
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey)
  return {audience, issuer, privateKey, token, verifier}
}

describe('Neon Auth JWT verifier', () => {
  it('derives the trusted identity only from a valid bearer JWT', async () => {
    const {token, verifier} = await fixture()
    await expect(verifier.verify(new Request('https://api.example/v1/me', {
      headers: {authorization: `Bearer ${token}`},
    }))).resolves.toEqual({
      status: 'authenticated',
      identity: {subject: 'neon-user-1', email: 'luna@example.com', displayName: 'Luna'},
    })
  })

  it('distinguishes a missing credential from malformed and unverifiable credentials', async () => {
    const {verifier} = await fixture()
    await expect(verifier.verify(new Request('https://api.example/v1/me'))).resolves.toEqual({status: 'missing'})
    await expect(verifier.verify(new Request('https://api.example/v1/me', {headers: {authorization: 'Basic nope'}}))).resolves.toEqual({status: 'invalid'})
    await expect(verifier.verify(new Request('https://api.example/v1/me', {headers: {authorization: 'Bearer malformed'}}))).resolves.toEqual({status: 'invalid'})
    await expect(verifier.verify(new Request('https://api.example/v1/me', {headers: {authorization: `Bearer ${'a'.repeat(16_385)}`}}))).resolves.toEqual({status: 'invalid'})
  })

  it('rejects a valid signature with the wrong issuer or audience', async () => {
    const {audience, privateKey, verifier} = await fixture()
    const token = await new SignJWT({})
      .setProtectedHeader({alg: 'ES256', kid: 'test-key'})
      .setIssuer('https://attacker.example')
      .setAudience(audience)
      .setSubject('neon-user-1')
      .setExpirationTime('2m')
      .sign(privateKey)
    await expect(verifier.verify(new Request('https://api.example', {headers: {authorization: `Bearer ${token}`}}))).resolves.toEqual({status: 'invalid'})
  })
})
