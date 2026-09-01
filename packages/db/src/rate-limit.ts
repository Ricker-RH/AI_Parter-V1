import {Pool} from '@neondatabase/serverless'
import type {QueryClient} from './session.js'

export type DatabaseRateLimitPolicy='chat_send'|'comment_create'|'social_mutation'|'creator_mutation'|'admin_mutation'|'auth_attempt'
export type DatabaseRateLimitDecision={allowed:boolean;remaining:number;retryAfterSeconds:number}
export type RateLimitRepository={consume(input:{policy:DatabaseRateLimitPolicy;identifierHash:string}):Promise<DatabaseRateLimitDecision>}

type Row={allowed:boolean;remaining:number;retry_after_seconds:number}
export function createRateLimitRepository(client:Pick<QueryClient,'query'>):RateLimitRepository {
  return {async consume(input){
    const result=await client.query<Row>('SELECT allowed,remaining,retry_after_seconds FROM public.consume_rate_limit($1,$2)',[input.policy,input.identifierHash])
    const row=result.rows[0]
    if(!row) throw new Error('Rate limit decision unavailable')
    return {allowed:row.allowed,remaining:row.remaining,retryAfterSeconds:row.retry_after_seconds}
  }}
}

export function createRateLimitRepositoryFromUrl(connectionString:string):RateLimitRepository {
  const protocol=new URL(connectionString).protocol
  if(protocol!=='postgres:'&&protocol!=='postgresql:') throw new Error('Rate limit URL must use postgres')
  const pool=new Pool({connectionString})
  return createRateLimitRepository(pool)
}

export function createReadinessProbeFromUrl(connectionString:string):{check():Promise<boolean>} {
  const protocol=new URL(connectionString).protocol
  if(protocol!=='postgres:'&&protocol!=='postgresql:') throw new Error('Readiness URL must use postgres')
  const pool=new Pool({connectionString})
  return {async check(){const result=await pool.query<{ok:number}>('SELECT 1 AS ok');return result.rows[0]?.ok===1}}
}
