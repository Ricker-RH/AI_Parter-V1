import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'
import {createChatTargetRepository} from '../src/chat-target.js'
import {createActorSession} from '../src/session.js'

const connectionString = process.env.DATABASE_ADMIN_URL ?? ''
const describeIntegration = connectionString ? describe : describe.skip
const pool = new Pool({connectionString})

async function createHuman(client: PoolClient, authSubject: string): Promise<string> {
  const id = randomUUID()
  await client.query(
    "INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Human')",
    [id, authSubject, `human_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  return id
}

async function createIp(
  client: PoolClient,
  state: 'published' | 'paused',
  enabled: boolean,
): Promise<string> {
  const id = randomUUID()
  const revisionId = randomUUID()
  await client.query(
    "INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'IP')",
    [id, `ip_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  await client.query(
    "INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled) VALUES($1,'platform','draft',false)",
    [id],
  )
  await client.query(
    "INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'IP',ARRAY['en'])",
    [revisionId, id],
  )
  await client.query(
    'UPDATE public.ip_profiles SET current_identity_revision_id=$2,public_state=$3,operation_enabled=$4 WHERE profile_id=$1',
    [id, revisionId, state, enabled],
  )
  return id
}

afterAll(async () => pool.end())

describeIntegration('chat target repository', () => {
  it('allows only an enabled, published IP with a current public identity', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const subject = `auth_${randomUUID()}`
      const humanId = await createHuman(client, subject)
      const availableIp = await createIp(client, 'published', true)
      const disabledIp = await createIp(client, 'published', false)
      const pausedIp = await createIp(client, 'paused', true)
      const queryClient = {query: client.query.bind(client), release() {}}
      const session = createActorSession(
        {connect: async () => queryClient},
        {transactionMode: 'nested'},
      )
      const repository = createChatTargetRepository(session.withActor)

      await expect(repository.isPublicChatIp({subject}, availableIp)).resolves.toBe(true)
      await expect(repository.isPublicChatIp({subject}, disabledIp)).resolves.toBe(false)
      await expect(repository.isPublicChatIp({subject}, pausedIp)).resolves.toBe(false)
      await expect(repository.isPublicChatIp({subject}, humanId)).resolves.toBe(false)
      await expect(repository.isPublicChatIp({subject}, randomUUID())).resolves.toBe(false)
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
      client.release()
    }
  })
})
