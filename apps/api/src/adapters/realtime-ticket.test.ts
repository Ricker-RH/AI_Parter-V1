import {describe, expect, it, vi} from 'vitest'
import {createRealtimeTickets} from './realtime-ticket.js'

const profileId = '0d3a2b65-1394-43bb-8c33-d32171757901'
const origin = 'https://test.example.com'
function setup() {
  let now = 1_800_000_000
  const used = new Set<string>()
  const tickets = createRealtimeTickets({
    secret: 'test-only-strong-secret-01234567890123456789',
    issuer: 'aifans-test', audience: 'aifans-realtime-test',
    allowedOrigins: [origin], now: () => now,
    consume: async (id) => { if (used.has(id)) return false; used.add(id); return true },
  })
  return {tickets, advance: (seconds: number) => { now += seconds }}
}

describe('short-lived realtime connection tickets', () => {
  it('passes verified issuance milliseconds to the durable revocation cutoff',async()=>{
    const consume=vi.fn(async()=>true)
    const tickets=createRealtimeTickets({secret:'s'.repeat(32),issuer:'test',audience:'test',allowedOrigins:[origin],now:()=>1_800_000_000,consume})
    await tickets.consume(await tickets.issue({subject:'auth-user',profileId,origin}),origin)
    expect(consume).toHaveBeenCalledWith(expect.any(String),1_800_000_060,{subject:'auth-user',profileId},1_800_000_300_000,1_800_000_000_000)
  })
  it('rejects whitespace signing secrets',()=>{
    for(const secret of [' '.repeat(32),` ${'s'.repeat(32)}`,`${'s'.repeat(32)} `]) expect(()=>createRealtimeTickets({secret,issuer:'api',audience:'gateway',allowedOrigins:[origin],consume:async()=>true})).toThrow('INVALID_REALTIME_CONFIGURATION')
  })
  it('binds authenticated identity and permits one successful consumption', async () => {
    const {tickets} = setup()
    const ticket = await tickets.issue({subject: 'auth-user', profileId, origin})
    expect(await tickets.consume(ticket, origin)).toMatchObject({subject: 'auth-user', profileId, sessionId: expect.any(String), sessionExpiresAt: 1_800_000_300_000})
    await expect(tickets.consume(ticket, origin)).rejects.toThrow('INVALID_REALTIME_TICKET')
  })
  it('rejects expired, tampered and wrong-origin tickets without consuming a valid ticket', async () => {
    const {tickets, advance} = setup()
    const ticket = await tickets.issue({subject: 'auth-user', profileId, origin})
    await expect(tickets.consume(ticket, 'https://evil.example')).rejects.toThrow('INVALID_REALTIME_TICKET')
    await expect(tickets.consume(`${ticket}x`, origin)).rejects.toThrow('INVALID_REALTIME_TICKET')
    advance(61)
    await expect(tickets.consume(ticket, origin)).rejects.toThrow('INVALID_REALTIME_TICKET')
  })
  it('accepts only one of concurrent replays with an atomic consume store', async () => {
    const {tickets} = setup()
    const ticket = await tickets.issue({subject: 'auth-user', profileId, origin})
    const results = await Promise.allSettled([tickets.consume(ticket, origin), tickets.consume(ticket, origin)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  })
  it('rejects cross-environment audience and untrusted mint inputs', async () => {
    const {tickets} = setup()
    await expect(tickets.issue({subject: 'auth-user', profileId, origin: 'https://evil.example'})).rejects.toThrow()
    await expect(tickets.issue({subject: '', profileId, origin})).rejects.toThrow()
    const other = createRealtimeTickets({secret: 'test-only-strong-secret-01234567890123456789', issuer: 'aifans-test', audience: 'production', allowedOrigins: [origin], now: () => 1_800_000_000, consume: async () => true})
    const ticket = await other.issue({subject: 'auth-user', profileId, origin})
    await expect(tickets.consume(ticket, origin)).rejects.toThrow('INVALID_REALTIME_TICKET')
  })
  it('fails closed when replay storage fails and redacts its error', async () => {
    const tickets = createRealtimeTickets({secret: 'test-only-strong-secret-01234567890123456789', issuer: 'test', audience: 'test', allowedOrigins: [origin], consume: async () => { throw new Error('secret backend details') }})
    const ticket = await tickets.issue({subject: 'auth-user', profileId, origin})
    await expect(tickets.consume(ticket, origin)).rejects.toThrow('INVALID_REALTIME_TICKET')
  })
  it('rejects weak secrets and insecure origins at startup', () => {
    expect(() => createRealtimeTickets({secret: 'weak', issuer: 'test', audience: 'test', allowedOrigins: [origin], consume: async () => true})).toThrow()
    expect(() => createRealtimeTickets({secret: 'test-only-strong-secret-01234567890123456789', issuer: 'test', audience: 'test', allowedOrigins: ['http://example.com'], consume: async () => true})).toThrow()
  })
})
