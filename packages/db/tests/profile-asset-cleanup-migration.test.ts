import {readFileSync} from 'node:fs'
import {expect, it} from 'vitest'

it('bounds cleanup, locks profiles before reservations, and grants only narrow platform entrypoints', () => {
  const sql = readFileSync(new URL('../migrations/202609040004_profile_asset_cleanup.sql', import.meta.url), 'utf8')
  expect(sql).toContain('LIMIT 10')
  expect(sql).toContain('FOR UPDATE SKIP LOCKED')
  expect(sql).toContain("interval '24 hours'")
  expect(sql).toContain('p.avatar_object_key = r.final_object_key OR p.background_object_key = r.final_object_key')
  expect(sql).toContain('AFTER UPDATE OF avatar_object_key, background_object_key')
  expect(sql).toContain('TO aifans_platform')
  expect(sql).not.toMatch(/GRANT (?:ALL|DELETE|UPDATE|SELECT).*ON (?:TABLE )?public\.profile_asset_upload_reservations/)
})
