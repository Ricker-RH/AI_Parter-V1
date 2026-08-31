import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {ensureHumanProfile} from '../src/profiles.js'

const previousProvisioning = process.env.DATABASE_PROVISIONING_URL
const previousAdmin = process.env.DATABASE_ADMIN_URL

afterEach(() => {
  if (previousProvisioning === undefined) delete process.env.DATABASE_PROVISIONING_URL
  else process.env.DATABASE_PROVISIONING_URL = previousProvisioning
  if (previousAdmin === undefined) delete process.env.DATABASE_ADMIN_URL
  else process.env.DATABASE_ADMIN_URL = previousAdmin
})

describe('profile provisioning credential boundary', () => {
  it('does not fall back to the migration/admin credential', async () => {
    delete process.env.DATABASE_PROVISIONING_URL
    process.env.DATABASE_ADMIN_URL = 'postgresql://owner:secret@db.example/aifans'
    await expect(ensureHumanProfile({authSubject: 'real-neon-subject'})).rejects.toThrow(
      'DATABASE_PROVISIONING_URL must be a valid postgres URL',
    )
  })
})

const integrationUrl = process.env.DATABASE_ADMIN_URL
const describeIntegration = integrationUrl ? describe : describe.skip
const integrationPool = integrationUrl ? new Pool({connectionString: integrationUrl}) : null

afterAll(async () => {
  await integrationPool?.end()
})

describeIntegration('aifans_provisioner database role', () => {
  it('can create and read a human profile but cannot update it', async () => {
    const client = await integrationPool!.connect()
    const id = randomUUID()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE aifans_provisioner')
      await expect(client.query(
        "INSERT INTO public.profiles (id, auth_subject, account_kind, username, display_name) VALUES ($1,$2,'human',$3,$4)",
        [id, `auth_${id}`, `user_${id.replaceAll('-', '').slice(0, 25)}`, 'Provisioned'],
      )).resolves.toMatchObject({rowCount: 1})
      await expect(client.query('SELECT auth_subject FROM public.profiles WHERE id = $1', [id])).resolves.toMatchObject({rowCount: 1})
      await expect(client.query('UPDATE public.profiles SET display_name = $1 WHERE id = $2', ['Escalated', id])).rejects.toThrow(/permission denied/)
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
      client.release()
    }
  })
})
