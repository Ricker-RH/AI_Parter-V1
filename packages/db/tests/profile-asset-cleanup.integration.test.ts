import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'

const connectionString = process.env.DATABASE_URL ?? ''
const integration = connectionString ? describe : describe.skip
const pool = new Pool({connectionString})
afterAll(() => pool.end())

async function seed(client: PoolClient, expires = "clock_timestamp() - interval '2 days'", consumed = false) {
  const owner = randomUUID(), id = randomUUID()
  const staging = `staging/profiles/${owner}/avatar/${id}.png`
  const final = `public/profiles/${owner}/avatar/${id}.webp`
  await client.query(`INSERT INTO public.profiles(id, auth_subject, account_kind, username, display_name)
    VALUES ($1::uuid, $1::text, 'human', $2, 'Cleanup test')`, [owner, `clean_${owner.replaceAll('-', '').slice(0, 20)}`])
  await client.query(`INSERT INTO public.profile_asset_upload_reservations
    (id,owner_profile_id,role,staging_object_key,final_object_key,upload_content_type,declared_size_bytes,width,height,
     created_at,expires_at,verified_at,consumed_at)
    VALUES ($1,$2,'avatar',$3,$4,'image/png',100,512,512,clock_timestamp()-interval '3 days',${expires},
      clock_timestamp()-interval '3 days',${consumed ? "clock_timestamp()-interval '3 days'" : 'NULL'})`, [id, owner, staging, final])
  return {id, owner, staging, final}
}

async function transaction(run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect()
  try {await client.query('BEGIN'); await run(client)}
  finally {await client.query('ROLLBACK'); client.release()}
}

integration('profile cleanup SQL lifecycle', () => {
  it('protects both current references while retrying staging and respects abandoned upload grace', () => transaction(async client => {
    const abandoned = await seed(client)
    const current = await seed(client, undefined, true)
    const recent = await seed(client, "clock_timestamp() - interval '1 hour'")
    await client.query('UPDATE public.profiles SET avatar_object_key=$2 WHERE id=$1', [current.owner, current.final])
    await client.query('SET LOCAL ROLE aifans_platform')
    const candidates = (await client.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows
    expect(candidates).toContainEqual({asset_id: abandoned.id, staging_object_key: abandoned.staging, final_object_key: abandoned.final})
    expect(candidates).toContainEqual({asset_id: current.id, staging_object_key: current.staging, final_object_key: null})
    expect(candidates.some(row => row.asset_id === recent.id)).toBe(false)
    await client.query('SELECT public.profile_asset_cleanup_complete($1,false,true)', [abandoned.id])
    expect((await client.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows)
      .toContainEqual({asset_id: abandoned.id, staging_object_key: abandoned.staging, final_object_key: null})
    await client.query('SELECT public.profile_asset_cleanup_complete($1,true,false)', [abandoned.id])
    expect((await client.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows.some(row => row.asset_id === abandoned.id)).toBe(false)
  }))

  it('records replacement retirement and waits a full 24 hours before deleting the old final', () => transaction(async client => {
    const asset = await seed(client, undefined, true)
    await client.query('UPDATE public.profiles SET avatar_object_key=$2 WHERE id=$1', [asset.owner, asset.final])
    await client.query('UPDATE public.profiles SET avatar_object_key=NULL WHERE id=$1', [asset.owner])
    expect((await client.query('SELECT retired_at FROM public.profile_asset_upload_reservations WHERE id=$1', [asset.id])).rows[0]?.retired_at).toBeTruthy()
    expect((await client.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows.find(row => row.asset_id === asset.id)?.final_object_key).toBeNull()
    await client.query("UPDATE public.profile_asset_upload_reservations SET retired_at=clock_timestamp()-interval '25 hours' WHERE id=$1", [asset.id])
    expect((await client.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows.find(row => row.asset_id === asset.id)?.final_object_key).toBe(asset.final)
    // Defense in depth: even a retirement marker must never override a live reference.
    await client.query("UPDATE public.profiles SET background_type='image',background_object_key=$2 WHERE id=$1", [asset.owner, asset.final])
    expect((await client.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows.find(row => row.asset_id === asset.id)?.final_object_key).toBeNull()
  }))

  it('denies cleanup to authenticated/anonymous roles and exposes no raw table write grant', () => transaction(async client => {
    for (const role of ['aifans_authenticated', 'aifans_anon']) {
      const privileges = (await client.query(`SELECT
        has_function_privilege($1,'public.profile_asset_cleanup_candidates()','EXECUTE') AS execute,
        has_table_privilege($1,'public.profile_asset_upload_reservations','DELETE') AS delete`, [role])).rows[0]
      expect(privileges).toEqual({execute: false, delete: false})
    }
  }))

  it('skips a profile being edited and lets only one simultaneous cleanup transaction claim it', async () => {
    const first = await pool.connect(), second = await pool.connect()
    let asset: Awaited<ReturnType<typeof seed>> | undefined
    try {
      asset = await seed(first)
      await first.query('BEGIN')
      await first.query('SELECT 1 FROM public.profiles WHERE id=$1 FOR UPDATE', [asset.owner])
      await second.query('BEGIN')
      await second.query('SET LOCAL ROLE aifans_platform')
      expect((await second.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows.some(row => row.asset_id === asset!.id)).toBe(false)
      await first.query('ROLLBACK')
      expect((await second.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows.some(row => row.asset_id === asset!.id)).toBe(true)
      await first.query('BEGIN')
      await first.query('SET LOCAL ROLE aifans_platform')
      expect((await first.query('SELECT * FROM public.profile_asset_cleanup_candidates()')).rows.some(row => row.asset_id === asset!.id)).toBe(false)
    } finally {
      await first.query('ROLLBACK'); await second.query('ROLLBACK')
      if (asset) {
        await first.query('DELETE FROM public.profile_asset_upload_reservations WHERE id=$1', [asset.id])
        await first.query('DELETE FROM public.profiles WHERE id=$1', [asset.owner])
      }
      first.release(); second.release()
    }
  })
})
