import {Pool} from '@neondatabase/serverless'

export type Actor = {subject: string}

export type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[]
  rowCount: number | null
}

export type QueryClient = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>
  release(): void
}

export type QueryPool = {
  connect(): Promise<QueryClient>
}

export type WithActor = <T>(
  actor: Actor,
  callback: (client: QueryClient) => Promise<T>,
) => Promise<T>

export type WithPlatformActor = <T>(
  actor: Actor,
  callback: (client: QueryClient) => Promise<T>,
) => Promise<T>

function requirePostgresUrl(name: 'DATABASE_USER_URL' | 'DATABASE_ADMIN_URL' | 'DATABASE_PLATFORM_URL'): string {
  const value = process.env[name]
  try {
    const {protocol} = new URL(value ?? '')
    if (protocol === 'postgres:' || protocol === 'postgresql:') return value!
  } catch {
    // Fall through to the single redacted error below.
  }
  throw new Error(`${name} must be a valid postgres URL`)
}

function createRoleSession(pool: QueryPool, role: 'aifans_authenticated' | 'aifans_platform') {
  return async <T>(actor: Actor, callback: (client: QueryClient) => Promise<T>): Promise<T> => {
    if (!actor.subject.trim()) throw new Error('Actor subject must not be blank')
    const client = await pool.connect()
    const transaction = await client.query<{txid: string | null}>('SELECT txid_current_if_assigned() AS txid')
    const ownsTransaction = transaction.rows[0]?.txid === null
    const savepoint = role === 'aifans_platform' ? 'platform_session' : 'actor_session'
    try {
      await client.query(ownsTransaction ? 'BEGIN' : `SAVEPOINT ${savepoint}`)
      try {
        await client.query(`SET LOCAL ROLE ${role}`)
        await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({sub: actor.subject})])
        const result = await callback(client)
        await client.query(ownsTransaction ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`)
        if (!ownsTransaction) await client.query('SET LOCAL ROLE NONE')
        return result
      } catch (error) {
        await client.query(ownsTransaction ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => undefined)
        if (!ownsTransaction) await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => undefined)
        throw error
      }
    } finally {
      client.release()
    }
  }
}

export function createActorSession(pool: QueryPool): {withActor: WithActor} {
  return {withActor: createRoleSession(pool, 'aifans_authenticated')}
}

export function createPlatformSession(pool: QueryPool): {withPlatformActor: WithPlatformActor} {
  return {withPlatformActor: createRoleSession(pool, 'aifans_platform')}
}

let userPool: Pool | undefined
let platformPool: Pool | undefined

function getUserPool(): Pool {
  userPool ??= new Pool({connectionString: requirePostgresUrl('DATABASE_USER_URL')})
  return userPool
}

function getPlatformPool(): Pool {
  platformPool ??= new Pool({connectionString: requirePostgresUrl('DATABASE_PLATFORM_URL')})
  return platformPool
}

export async function withActor<T>(
  actor: Actor,
  callback: (client: QueryClient) => Promise<T>,
): Promise<T> {
  return createActorSession(getUserPool()).withActor(actor, callback)
}


export async function withPlatformActor<T>(
  actor: Actor,
  callback: (client: QueryClient) => Promise<T>,
): Promise<T> {
  return createPlatformSession(getPlatformPool()).withPlatformActor(actor, callback)
}
