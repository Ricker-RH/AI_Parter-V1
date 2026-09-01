import {randomBytes} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,expect,it,vi} from 'vitest'
import {createRateLimitRepository,createScopedRateLimitRepository} from '../src/rate-limit.js'
import type {QueryClient,QueryPool} from '../src/session.js'

const connectionString=process.env.DATABASE_URL??''
const describeIntegration=connectionString?describe:describe.skip
const pool=new Pool({connectionString})

describe('rate-limit runtime session',()=>{
  it('enters the bounded rate-limiter role for each decision',async()=>{
    const statements:string[]=[]
    const client={query:async(text:string)=>{statements.push(text);return text.includes('consume_rate_limit')?{rows:[{allowed:true,remaining:9,retry_after_seconds:60}],rowCount:1}:{rows:[],rowCount:null}},release:vi.fn()} as QueryClient
    const runtime=createScopedRateLimitRepository({connect:async()=>client} satisfies QueryPool)
    await expect(runtime.consume({policy:'admin_mutation',identifierHash:'a'.repeat(64)})).resolves.toMatchObject({allowed:true})
    expect(statements).toEqual(['BEGIN','SET LOCAL ROLE aifans_rate_limiter',expect.stringContaining('consume_rate_limit'),'COMMIT'])
    expect(client.release).toHaveBeenCalledOnce()
  })
})

describeIntegration('database rate limiting',()=>{
  afterAll(async()=>pool.end())

  it('allows only the fixed policy quota under concurrent serverless calls',async()=>{
    const identifierHash=randomBytes(32).toString('hex')
    const results=await Promise.all(Array.from({length:20},async()=>{
      const client=await pool.connect()
      try {await client.query('BEGIN');await client.query('SET LOCAL ROLE aifans_rate_limiter');const result=await createRateLimitRepository(client).consume({policy:'auth_attempt',identifierHash});await client.query('COMMIT');return result}
      catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
      finally{client.release()}
    }))
    expect(results.filter(result=>result.allowed)).toHaveLength(10)
    expect(results.filter(result=>!result.allowed)).toHaveLength(10)
    expect(results.every(result=>result.retryAfterSeconds>=1&&result.retryAfterSeconds<=60)).toBe(true)
  })

  it('stores only bounded hashes and denies custom policies and direct table access',async()=>{
    const client=await pool.connect()
    try {
      await client.query('BEGIN');await client.query('SET LOCAL ROLE aifans_rate_limiter')
      await expect(client.query("SELECT * FROM public.rate_limit_buckets")).rejects.toThrow(/permission denied/i)
      await client.query('ROLLBACK');await client.query('BEGIN');await client.query('SET LOCAL ROLE aifans_rate_limiter')
      await expect(client.query("SELECT * FROM public.consume_rate_limit('custom_limit',$1)",[randomBytes(32).toString('hex')])).rejects.toThrow(/invalid rate limit/i)
      await client.query('ROLLBACK');await client.query('BEGIN')
      const functions=await client.query("SELECT proargnames FROM pg_proc WHERE oid='public.consume_rate_limit(text,text)'::regprocedure")
      expect(functions.rows[0]?.proargnames).toEqual(expect.not.arrayContaining(['requested_limit','limit']))
    } finally {await client.query('ROLLBACK').catch(()=>undefined);client.release()}
  })
})
