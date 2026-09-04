import {z} from 'zod'
import type {Actor,WithActor} from './session.js'
/** Owner-scoped authenticated SQL; never accepts a profile or session selector. */
export function createRealtimeRevocationRepository({withActor}:{withActor:WithActor}){
 return {async revokeOwn(actor:Actor):Promise<number>{
  return withActor(actor,async client=>{
   const result=await client.query('SELECT public.revoke_own_realtime_sessions() AS revoked')
   return z.number().int().nonnegative().max(2147483647).parse(result.rows[0]?.revoked)
  })
 }}
}
