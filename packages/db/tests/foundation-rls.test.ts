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

async function updateOwnDisplayName(
  client: PoolClient,
  subject: string,
  displayName: string,
) {
  await become(client, 'aifans_authenticated', { sub: subject })
  const result = await client.query(
    'UPDATE public.profiles SET display_name = $1',
    [displayName],
  )
  return result.rowCount
}

async function updateOtherDisplayName(
  client: PoolClient,
  subject: string,
  otherId: string,
) {
  await become(client, 'aifans_authenticated', { sub: subject })
  const result = await client.query(
    'UPDATE public.profiles SET display_name = $1 WHERE id = $2',
    ['Not allowed', otherId],
  )
  return result.rowCount
}

async function changeOwnAccountKind(client: PoolClient, subject: string) {
  await become(client, 'aifans_authenticated', { sub: subject })
  return client.query("UPDATE public.profiles SET account_kind = 'ip'")
}

async function changeOwnAuthSubject(client: PoolClient, subject: string) {
  await become(client, 'aifans_authenticated', { sub: subject })
  return client.query("UPDATE public.profiles SET auth_subject = 'not-allowed'")
}

async function updateAllAllowedProfileFields(
  client: PoolClient,
  subject: string,
) {
  await become(client, 'aifans_authenticated', { sub: subject })
  const result = await client.query(
    `UPDATE public.profiles
     SET username = 'updated_human', display_name = 'Updated human', bio = 'Allowed bio',
         avatar_object_key = 'avatars/updated.png', preferred_locale = 'zh-CN',
         creator_mode_enabled = true`,
  )
  return result.rowCount
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

  it('permits an authenticated human to update only its own allowed profile fields', async () => {
    await inTransaction(async (owner) => {
      const first = await insertHuman(owner)
      const second = await insertHuman(owner)
      await expect(
        updateOwnDisplayName(owner, first.subject, 'New name'),
      ).resolves.toBe(1)
      await expect(
        updateAllAllowedProfileFields(owner, first.subject),
      ).resolves.toBe(1)
      await expect(
        updateOtherDisplayName(owner, first.subject, second.id),
      ).resolves.toBe(0)
      await expect(
        rejectedQuery(owner, () => changeOwnAccountKind(owner, first.subject)),
      ).rejects.toThrow(/permission denied/)
      await expect(
        rejectedQuery(owner, () => changeOwnAuthSubject(owner, first.subject)),
      ).rejects.toThrow(/permission denied/)
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
        'creator_mode_enabled',
        'display_name',
        'id',
        'preferred_locale',
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

  it('rejects owner changes to immutable profile fields and maintains updated_at', async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 5))
      await owner.query(
        "UPDATE public.profiles SET bio = 'Allowed' WHERE id = $1",
        [first.id],
      )
      const updated = await owner.query<{ created_at: Date; updated_at: Date }>(
        'SELECT created_at, updated_at FROM public.profiles WHERE id = $1',
        [first.id],
      )
      expect(updated.rows[0]?.created_at).toEqual(original.rows[0]?.created_at)
      expect(updated.rows[0]?.updated_at.getTime()).toBeGreaterThan(
        original.rows[0]?.updated_at.getTime() ?? 0,
      )
    })
  })
})
