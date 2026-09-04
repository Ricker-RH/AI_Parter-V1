import {expect, it} from 'vitest'
import {createProfileAssetCleanupRepository} from '../src/profile-asset-cleanup.js'
import type {QueryClient} from '../src/session.js'

function fixture(failCommit = false) {
  const calls: Array<{sql: string; values?: unknown[]}> = []
  const client = {async query(sql: string, values?: unknown[]) {
    calls.push({sql, values})
    if (sql === 'COMMIT' && failCommit) throw new Error('commit failed')
    return {rows: sql.includes('profile_asset_cleanup_candidates') ? [
      {asset_id: 'one', staging_object_key: 'staging-one', final_object_key: 'final-one'},
      {asset_id: 'two', staging_object_key: 'staging-two', final_object_key: null},
    ] : [], rowCount: 0}
  }, release() {calls.push({sql: 'release'})}} as QueryClient
  return {calls, repo: createProfileAssetCleanupRepository({connect: async () => client})}
}

it('holds platform transaction locks through exact-key deletion, records only success, and continues on storage failure', async () => {
  const {repo, calls} = fixture()
  const deleted: string[] = []
  expect(await repo.cleanupBatch(async key => {
    expect(calls.some(call => call.sql === 'COMMIT')).toBe(false)
    if (key === 'staging-one') throw new Error('storage unavailable')
    deleted.push(key)
  })).toEqual({processed: 2, deleted: 2, failed: 1})
  expect(deleted).toEqual(['final-one', 'staging-two'])
  expect(calls[1]?.sql).toBe('SET LOCAL ROLE aifans_platform')
  expect(calls.filter(call => call.sql.includes('profile_asset_cleanup_complete')).map(call => call.values)).toEqual([
    ['one', false, true], ['two', true, false],
  ])
  expect(calls.slice(-2).map(call => call.sql)).toEqual(['COMMIT', 'release'])
})

it('rolls back on database failure so deletion is safely retried', async () => {
  const {repo, calls} = fixture(true)
  await expect(repo.cleanupBatch(async () => {})).rejects.toThrow('commit failed')
  expect(calls.slice(-2).map(call => call.sql)).toEqual(['ROLLBACK', 'release'])
})
