import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const connectionString = process.env.DATABASE_URL ?? ''
const describeIntegration = connectionString ? describe : describe.skip
const pool = new Pool({ connectionString })

type Fixture = { id: string; subject: string }

async function inTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    return await callback(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

async function rejectedQuery<T>(
  client: PoolClient,
  query: () => Promise<T>,
): Promise<T> {
  await client.query('SAVEPOINT expected_failure')
  try {
    const result = await query()
    await client.query('ROLLBACK TO SAVEPOINT expected_failure')
    await client.query('RELEASE SAVEPOINT expected_failure')
    void result
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure')
    await client.query('RELEASE SAVEPOINT expected_failure')
    throw error
  }
  throw new Error('Expected query to fail')
}

async function queryErrorCode<T>(
  client: PoolClient,
  query: () => Promise<T>,
): Promise<string | undefined> {
  await client.query('SAVEPOINT expected_failure')
  try {
    await query()
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure')
    await client.query('RELEASE SAVEPOINT expected_failure')
    return (error as { code?: string }).code
  }
  await client.query('ROLLBACK TO SAVEPOINT expected_failure')
  await client.query('RELEASE SAVEPOINT expected_failure')
  return undefined
}

async function insertHuman(
  client: PoolClient,
  suffix = randomUUID().replaceAll('-', ''),
): Promise<Fixture> {
  const id = randomUUID()
  const subject = `auth-${suffix}`
  await client.query(
    `INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name)
     VALUES ($1, $2, 'human', $3, 'Display name')`,
    [id, subject, `human_${suffix.slice(0, 20)}`],
  )
  return { id, subject }
}

async function become(
  client: PoolClient,
  role: 'aifans_anon' | 'aifans_authenticated',
  claims: unknown,
): Promise<void> {
  await client.query(`SET LOCAL ROLE ${role}`)
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    typeof claims === 'string' ? claims : JSON.stringify(claims),
  ])
}

async function readPublicProfileAsAnon(client: PoolClient, id: string) {
  await become(client, 'aifans_anon', {})
  const result = await client.query(
    'SELECT id, account_kind, username, display_name FROM public.profiles WHERE id = $1',
    [id],
  )
  return result.rows[0]
}

async function insertProfileAsAuthenticated(
  client: PoolClient,
  subject: string,
) {
  await become(client, 'aifans_authenticated', { sub: subject })
  return client.query(
    "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1, $2, 'human', 'new_human', 'New human')",
    [randomUUID(), `another-${subject}`],
  )
}

async function deleteOwnProfile(client: PoolClient, subject: string) {
  await become(client, 'aifans_authenticated', { sub: subject })
  return client.query('DELETE FROM public.profiles')
}

async function readSettingsAsAnon(client: PoolClient) {
  await become(client, 'aifans_anon', {})
  return client.query('SELECT * FROM public.platform_settings')
}

async function readSettingsAsAuthenticated(
  client: PoolClient,
  subject: string,
) {
  await become(client, 'aifans_authenticated', { sub: subject })
  const result = await client.query(
    'SELECT default_ip_quota AS "defaultIpQuota" FROM public.platform_settings',
  )
  return result.rows[0]
}

async function readCurrentAccount(client: PoolClient, subject: string | null) {
  await become(
    client,
    'aifans_authenticated',
    subject === null ? {} : { sub: subject },
  )
  const result = await client.query<{ current_account: unknown }>(
    'SELECT public.current_account()',
  )
  return result.rows[0]?.current_account ?? null
}

describeIntegration('profiles and settings authorization foundation', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('allows anonymous callers to read the safe public profile projection', async () => {
    await inTransaction(async (owner) => {
      const first = await insertHuman(owner)
      expect(await readPublicProfileAsAnon(owner, first.id)).toMatchObject({
        id: first.id,
      })
    })
  })

  it('denies authenticated actors raw updates to every profile mutation column', async () => {
    await inTransaction(async (owner) => {
      const first = await insertHuman(owner)
      await become(owner, 'aifans_authenticated', {sub: first.subject})
      for (const statement of [
        "UPDATE public.profiles SET username = 'updated_human'",
        "UPDATE public.profiles SET display_name = 'Updated human'",
        "UPDATE public.profiles SET bio = 'Updated bio'",
        "UPDATE public.profiles SET avatar_object_key = NULL",
        "UPDATE public.profiles SET preferred_locale = 'zh-CN'",
        "UPDATE public.profiles SET creator_mode_enabled = true",
        "UPDATE public.profiles SET background_type = 'color'",
        "UPDATE public.profiles SET background_color_key = 'sage'",
        "UPDATE public.profiles SET background_object_key = NULL",
        "UPDATE public.profiles SET background_focal_x = 0.25",
        "UPDATE public.profiles SET background_focal_y = 0.75",
        "UPDATE public.profiles SET profile_version = profile_version + 1",
      ]) {
        await expect(rejectedQuery(owner, () => owner.query(statement)))
          .rejects.toThrow(/permission denied/)
      }
      await expect(
        rejectedQuery(owner, () =>
          insertProfileAsAuthenticated(owner, first.subject),
        ),
      ).rejects.toThrow(/permission denied/)
      await expect(
        rejectedQuery(owner, () => deleteOwnProfile(owner, first.subject)),
      ).rejects.toThrow(/permission denied/)
    })
  })

  it('keeps settings unavailable to anonymous callers and readable to authenticated callers', async () => {
    await inTransaction(async (owner) => {
      const first = await insertHuman(owner)
      await expect(
        rejectedQuery(owner, () => readSettingsAsAnon(owner)),
      ).rejects.toThrow(/permission denied/)
      await expect(
        readSettingsAsAuthenticated(owner, first.subject),
      ).resolves.toMatchObject({ defaultIpQuota: 3 })
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            'UPDATE public.platform_settings SET default_ip_quota = 4',
          ),
        ),
      ).rejects.toThrow(/permission denied/)
    })
  })

  it('returns only the current account safe projection', async () => {
    await inTransaction(async (owner) => {
      const first = await insertHuman(owner)
      const account = await readCurrentAccount(owner, first.subject)
      expect(account).toMatchObject({ id: first.id })
      expect(await readCurrentAccount(owner, null)).toBeNull()
      expect(Object.keys(account as object).sort()).toEqual([
        'account_kind',
        'avatar_object_key',
        'background_color_key',
        'background_focal_x',
        'background_focal_y',
        'background_object_key',
        'background_type',
        'creator_mode_enabled',
        'display_name',
        'id',
        'preferred_locale',
        'profile_version',
        'username',
      ])
    })
  })

  it('treats malformed claims as no current account', async () => {
    await inTransaction(async (owner) => {
      await insertHuman(owner)
      for (const claims of [
        '',
        '{bad',
        'null',
        '[]',
        '1',
        'true',
        '{}',
        '{"sub":"   "}',
        '{"sub":"\\t"}',
        '{"sub":"\\n"}',
      ]) {
        await become(owner, 'aifans_authenticated', claims)
        const result = await owner.query<{
          current_account: unknown
          subject: string | null
        }>(
          'SELECT app.current_auth_subject() AS subject, public.current_account()',
        )
        expect(result.rows[0]?.subject ?? null).toBeNull()
        expect(result.rows[0]?.current_account ?? null).toBeNull()
      }
    })
  })

  it('enforces profile and settings constraints for owner writes', async () => {
    await inTransaction(async (owner) => {
      const id = randomUUID()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1, 'subject', 'human', 'UPPER', 'Name')",
            [id],
          ),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1, 'subject-invalid', 'human', 'invalid-name', 'Name')",
            [randomUUID()],
          ),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1, 'subject', 'human', 'valid_name', '   ')",
            [randomUUID()],
          ),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "INSERT INTO public.profiles (id, account_kind, username, display_name) VALUES ($1, 'human', 'human_missing_subject', 'Name')",
            [randomUUID()],
          ),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1, '  ', 'human', 'human_blank_subject', 'Name')",
            [randomUUID()],
          ),
        ),
      ).rejects.toThrow()
      for (const [authSubject, username] of [
        ['\t', 'human_tab_subject'],
        ['\n', 'human_newline_subject'],
      ]) {
        await expect(
          queryErrorCode(owner, () =>
            owner.query(
              "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1, $2, 'human', $3, 'Name')",
              [randomUUID(), authSubject, username],
            ),
          ),
        ).resolves.toBe('23514')
      }
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1, 'subject', 'ip', 'ip_has_subject', 'Name')",
            [randomUUID()],
          ),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            'UPDATE public.platform_settings SET default_ip_quota = -1',
          ),
        ),
      ).rejects.toThrow()
      await expect(
        owner.query('UPDATE public.platform_settings SET default_ip_quota = 0'),
      ).resolves.toMatchObject({ rowCount: 1 })
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "INSERT INTO public.platform_settings (setting_key) VALUES ('global')",
          ),
        ),
      ).rejects.toThrow()
    })
  })

  it('rejects owner changes to immutable profile fields without changing timestamps', async () => {
    await inTransaction(async (owner) => {
      const first = await insertHuman(owner)
      const original = await owner.query<{
        created_at: Date
        updated_at: Date
      }>('SELECT created_at, updated_at FROM public.profiles WHERE id = $1', [
        first.id,
      ])
      await expect(
        rejectedQuery(owner, () =>
          owner.query('UPDATE public.profiles SET id = $1 WHERE id = $2', [
            randomUUID(),
            first.id,
          ]),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "UPDATE public.profiles SET auth_subject = 'changed' WHERE id = $1",
            [first.id],
          ),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "UPDATE public.profiles SET account_kind = 'ip' WHERE id = $1",
            [first.id],
          ),
        ),
      ).rejects.toThrow()
      await expect(
        rejectedQuery(owner, () =>
          owner.query(
            "UPDATE public.profiles SET created_at = created_at + interval '1 microsecond' WHERE id = $1",
            [first.id],
          ),
        ),
      ).rejects.toThrow()
      const updated = await owner.query<{ created_at: Date; updated_at: Date }>(
        'SELECT created_at, updated_at FROM public.profiles WHERE id = $1',
        [first.id],
      )
      expect(updated.rows[0]?.created_at).toEqual(original.rows[0]?.created_at)
      expect(updated.rows[0]?.updated_at).toEqual(original.rows[0]?.updated_at)
    })
  })
})
