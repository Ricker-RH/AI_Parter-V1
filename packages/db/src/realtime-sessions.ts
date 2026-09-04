import {z} from 'zod'
import type {WithPlatformActor} from './session.js'

export type RealtimeSessionIdentity = {sessionId:string; subject:string; profileId:string}
export type RealtimeSessionRedemption = RealtimeSessionIdentity & {ticketExpiresAt:number; sessionExpiresAt:number}
export type RealtimeSessionAuthorization = RealtimeSessionIdentity & {conversationId:string; eventType?:string}
export type RealtimeSessionDecision = {allowed:boolean; presenceAllowed:boolean}
export type RealtimeSessionRepository = {
  redeem(input:RealtimeSessionRedemption):Promise<boolean>
  authorize(input:RealtimeSessionAuthorization):Promise<RealtimeSessionDecision>
}

const identity = z.object({sessionId:z.uuid(),subject:z.string().min(1).max(512).refine(value=>value.trim().length>0),profileId:z.uuid()})
const epoch = z.number().int().nonnegative().max(8640000000000000)
const redemption = identity.extend({ticketExpiresAt:epoch,sessionExpiresAt:epoch})
const authorization = identity.extend({conversationId:z.uuid()})

/** Only a server-owned platform session factory belongs here, never browser actor credentials. */
export function createPostgresRealtimeSessionRepository({withPlatformActor}:{withPlatformActor:WithPlatformActor}):RealtimeSessionRepository {
  return {
    async redeem(input) {
      const parsed=redemption.safeParse(input)
      if(!parsed.success) return false
      const value=parsed.data
      return withPlatformActor({subject:'__realtime_service__'},async client=>{
        const result=await client.query('SELECT public.redeem_realtime_session($1,$2,$3,$4,$5) AS allowed',[
          value.sessionId,value.subject,value.profileId,new Date(value.ticketExpiresAt),new Date(value.sessionExpiresAt),
        ])
        return result.rows[0]?.allowed===true
      })
    },
    async authorize(input) {
      const parsed=authorization.safeParse(input)
      if(!parsed.success) return {allowed:false,presenceAllowed:false}
      const value=parsed.data
      return withPlatformActor({subject:'__realtime_service__'},async client=>{
        // Message/read subscriptions do not require mutual follows. The gateway
        // must additionally require presenceAllowed for typing/presence events.
        const result=await client.query('SELECT allowed,presence_allowed FROM public.authorize_realtime_session($1,$2,$3,$4)',[
          value.sessionId,value.subject,value.profileId,value.conversationId,
        ])
        const allowed=result.rows[0]?.allowed===true
        return {allowed,presenceAllowed:allowed && result.rows[0]?.presence_allowed===true}
      })
    },
  }
}
