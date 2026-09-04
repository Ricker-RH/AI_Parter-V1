import {Pool} from '@neondatabase/serverless'
import type {QueryPool} from './session.js'

export type ProfileAssetCleanupResult = {processed: number; deleted: number; failed: number}
export type ProfileAssetCleanupRepository = {
  cleanupBatch(remove: (objectKey: string) => Promise<void>): Promise<ProfileAssetCleanupResult>
}
type Candidate = {asset_id: string; staging_object_key: string | null; final_object_key: string | null}

export function createProfileAssetCleanupRepository(pool: QueryPool): ProfileAssetCleanupRepository {
  return {async cleanupBatch(remove) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE aifans_platform')
      await client.query("SET LOCAL statement_timeout = '5s'")
      const candidates = await client.query<Candidate>('SELECT * FROM public.profile_asset_cleanup_candidates()')
      const result = {processed: 0, deleted: 0, failed: 0}
      const deadline = Date.now() + 20_000
      // Candidate locks remain held until COMMIT. Object deletes are idempotent;
      // a failed delete or transaction is retried by the next invocation.
      for (const candidate of candidates.rows) {
        if (Date.now() >= deadline) break
        let stagingDeleted = false, finalDeleted = false
        for (const kind of ['staging_object_key', 'final_object_key'] as const) {
          const key = candidate[kind]
          if (!key || Date.now() >= deadline) continue
          try {
            await remove(key)
            if (kind === 'staging_object_key') stagingDeleted = true
            else finalDeleted = true
            result.deleted++
          } catch {result.failed++}
        }
        await client.query('SELECT public.profile_asset_cleanup_complete($1, $2, $3)',
          [candidate.asset_id, stagingDeleted, finalDeleted])
        result.processed++
      }
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {client.release()}
  }}
}

export function createProfileAssetCleanupRepositoryFromUrl(connectionString: string): ProfileAssetCleanupRepository {
  const protocol = new URL(connectionString).protocol
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') throw new Error('Profile cleanup URL must use postgres')
  return createProfileAssetCleanupRepository(new Pool({connectionString}))
}
