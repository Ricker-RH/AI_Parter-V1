import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../migrations/202609020004_followed_ip_projection.sql'),
  'utf8',
)

describe('followed IP projection migration', () => {
  it('bounds visible owner candidates before running the public profile projection', () => {
    const candidates = migration.match(/visible_candidates AS MATERIALIZED \(([\s\S]*?)\n  \)\n  SELECT/)?.[1]

    expect(candidates).toBeDefined()
    expect(candidates).toContain('public.social_current_human_profile_id()')
    expect(candidates).toContain("profile.account_kind='ip'")
    expect(candidates).toContain("followed.public_state='published'")
    expect(candidates).toContain('public.ip_identity_revisions')
    expect(candidates).toContain('identity.id=followed.current_identity_revision_id')
    expect(candidates).toContain("followed.source<>'creator'")
    expect(candidates).toContain('creator_revision.id IS NOT NULL')
    expect(candidates).toContain('(followed.created_at,followed.profile_id)<(after_profile_created_at,after_profile_id)')
    expect(candidates).toContain('ORDER BY followed.created_at DESC,followed.profile_id DESC')
    expect(candidates).toContain('LIMIT LEAST(GREATEST(COALESCE(page_limit,1),1),51)')

    const candidateLimit = migration.indexOf('LIMIT LEAST(GREATEST(COALESCE(page_limit,1),1),51)')
    const publicProjection = migration.indexOf('CROSS JOIN LATERAL public.social_public_ip_profile')
    expect(candidateLimit).toBeGreaterThan(-1)
    expect(publicProjection).toBeGreaterThan(candidateLimit)
  })
})
