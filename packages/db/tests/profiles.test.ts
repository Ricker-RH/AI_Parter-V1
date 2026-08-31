import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {createProfileRepository} from '../src/profiles.js'
import {createActorSession} from '../src/session.js'

const adminConnectionString = process.env.DATABASE_ADMIN_URL ?? ''
const userConnectionString = process.env.DATABASE_USER_URL ?? ''
const describeIntegration = adminConnectionString && userConnectionString ? describe : describe.skip
const adminPool = new Pool({connectionString: adminConnectionString})
const userPool = new Pool({connectionString: userConnectionString, max: 1})
const actorSession = createActorSession(userPool)
const repository = createProfileRepository({
  adminPool,
  withActor: actorSession.withActor,
})
const createdSubjects: string[] = []

function subject(): string {
  return `auth_${randomUUID()}`
}

afterEach(async () => {
  if (createdSubjects.length === 0) return
  const subjects = createdSubjects.splice(0)
  await adminPool.query('DELETE FROM public.profiles WHERE auth_subject = ANY($1::text[])', [
    subjects,
  ])
})

afterAll(async () => {
  await Promise.all([adminPool.end(), userPool.end()])
})

describeIntegration('authenticated profile repository', () => {
  it('provisions a human profile idempotently and looks up the current account', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)

    const first = await repository.ensureHumanProfile({
      authSubject,
      email: 'luna@example.com',
      displayName: null,
    })
    const second = await repository.ensureHumanProfile({
      authSubject: first.authSubject,
      email: 'changed@example.com',
      displayName: 'Changed',
    })

    expect(second.id).toBe(first.id)
    expect(first.accountKind).toBe('human')
    expect(first.username).toMatch(/^user_[a-f0-9]{25}$/)
    expect(first.displayName).toBe('luna')
    expect(first.avatarUrl).toBeUndefined()
    expect(await repository.getCurrentAccount({subject: first.authSubject})).toMatchObject({
      id: first.id,
      kind: 'human',
    })
    expect(await repository.getCurrentAccount(null)).toBeNull()
  })

  it('uses a safe display-name fallback when an email is unavailable', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)

    await expect(
      repository.ensureHumanProfile({authSubject, email: null, displayName: '   '}),
    ).resolves.toMatchObject({displayName: 'AIFANS User'})
  })

  it('rejects blank subjects before a scoped callback can run', async () => {
    await expect(
      actorSession.withActor({subject: ' \t '}, async () => undefined),
    ).rejects.toThrow('Actor subject must not be blank')
  })

  it('prevents scoped users from changing immutable fields or another profile', async () => {
    const firstSubject = subject()
    const secondSubject = subject()
    createdSubjects.push(firstSubject, secondSubject)
    const first = await repository.ensureHumanProfile({
      authSubject: firstSubject,
      email: null,
      displayName: 'First',
    })
    const second = await repository.ensureHumanProfile({
      authSubject: secondSubject,
      email: null,
      displayName: 'Second',
    })

    await expect(
      actorSession.withActor({subject: first.authSubject}, (client) =>
        client.query("UPDATE public.profiles SET account_kind = 'ip'"),
      ),
    ).rejects.toThrow(/permission denied/)

    await expect(
      actorSession.withActor({subject: first.authSubject}, async (client) => {
        const result = await client.query(
          'UPDATE public.profiles SET display_name = $1 WHERE id = $2',
          ['Not allowed', second.id],
        )
        return result.rowCount
      }),
    ).resolves.toBe(0)
  })

  it('clears role and claim state before its injected connection is reused', async () => {
    const authSubject = subject()
    createdSubjects.push(authSubject)
    await repository.ensureHumanProfile({authSubject, email: null, displayName: 'State'})

    await actorSession.withActor({subject: authSubject}, async (client) => {
      const result = await client.query<{
        role: string
        claims: string | null
      }>("SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims")
      expect(result.rows[0]).toEqual({
        role: 'aifans_authenticated',
        claims: JSON.stringify({sub: authSubject}),
      })
    })

    const client = await userPool.connect()
    try {
      const result = await client.query<{
        role: string
        claims: string | null
        current_account: unknown
      }>(
        "SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims, public.current_account() AS current_account",
      )
      expect(result.rows[0]?.role).toBe('aifans_owner')
      expect(result.rows[0]?.claims ?? '').toMatch(/^\s*$/)
      expect(result.rows[0]?.current_account ?? null).toBeNull()
    } finally {
      client.release()
    }
  })
})
