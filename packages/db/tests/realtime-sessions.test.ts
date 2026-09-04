import {existsSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'
import type {QueryClient, WithPlatformActor} from '../src/session.js'

const input={sessionId:'11111111-1111-4111-8111-111111111111',subject:'human|one',profileId:'22222222-2222-4222-8222-222222222222',ticketExpiresAt:Date.now()+45000,sessionExpiresAt:Date.now()+240000}
async function fixture(rows:Record<string,unknown>[]) {
  expect(existsSync(new URL('../src/realtime-sessions.ts',import.meta.url))).toBe(true)
  const {createPostgresRealtimeSessionRepository}=await import('../src/realtime-sessions.js')
  const query=vi.fn(async()=>({rows,rowCount:rows.length}))
  const withPlatformActor:WithPlatformActor=vi.fn(async(_actor,callback)=>callback({query,release(){}} as QueryClient))
  return {repository:createPostgresRealtimeSessionRepository({withPlatformActor}),query,withPlatformActor}
}
describe('trusted durable realtime repository',()=>{
  it('redeems via the bounded platform function with epoch milliseconds converted to dates',async()=>{
    const f=await fixture([{allowed:true}])
    expect(await f.repository.redeem(input)).toBe(true)
    expect(f.withPlatformActor).toHaveBeenCalledWith({subject:'__realtime_service__'},expect.any(Function))
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('public.redeem_realtime_session'),[input.sessionId,input.subject,input.profileId,new Date(input.ticketExpiresAt),new Date(input.sessionExpiresAt)])
  })
  it('maps authorization and preserves separate presence decisions for message/read events',async()=>{
    const f=await fixture([{allowed:true,presence_allowed:false}])
    expect(await f.repository.authorize({...input,conversationId:input.sessionId,eventType:'message'})).toEqual({allowed:true,presenceAllowed:false})
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('public.authorize_realtime_session'),[input.sessionId,input.subject,input.profileId,input.sessionId])
  })
  it('fails closed when a decision row is missing or not a strict boolean',async()=>{
    for(const rows of [[],[{allowed:'true',presence_allowed:true}],[{allowed:false,presence_allowed:true}]]) {
      const f=await fixture(rows)
      expect(await f.repository.redeem(input)).toBe(false)
      expect(await f.repository.authorize({...input,conversationId:input.sessionId})).toEqual({allowed:false,presenceAllowed:false})
    }
  })
  it('rejects malformed identifiers and nonfinite expiry before accessing the platform connection',async()=>{
    const f=await fixture([{allowed:true}])
    for(const value of [{...input,sessionId:'bad'},{...input,subject:' '},{...input,ticketExpiresAt:NaN},{...input,sessionExpiresAt:Infinity}]) expect(await f.repository.redeem(value)).toBe(false)
    expect(await f.repository.authorize({...input,conversationId:'bad'})).toEqual({allowed:false,presenceAllowed:false})
    expect(f.withPlatformActor).not.toHaveBeenCalled()
  })
})
