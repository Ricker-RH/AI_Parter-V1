import {randomBytes} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,expect,it} from 'vitest'
import {createRateLimitRepository} from '../src/rate-limit.js'

const connectionString=process.env.DATABASE_URL??''
const describeIntegration=connectionString?describe:describe.skip
const pool=new Pool({connectionString})

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
