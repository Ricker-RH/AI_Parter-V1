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

export type RoleSessionOptions = {
  transactionMode: 'owned' | 'nested'
}

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

function createRoleSession(
  pool: QueryPool,
  role: 'aifans_authenticated' | 'aifans_platform',
  {transactionMode}: RoleSessionOptions,
) {
  return async <T>(actor: Actor, callback: (client: QueryClient) => Promise<T>): Promise<T> => {
    if (!actor.subject.trim()) throw new Error('Actor subject must not be blank')
    const client = await pool.connect()
    const ownsTransaction = transactionMode === 'owned'
    const savepoint = role === 'aifans_platform' ? 'platform_session' : 'actor_session'
    try {
      const callerState = ownsTransaction
        ? undefined
        : (await client.query<{role: string; claims: string | null}>(
            "SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims",
          )).rows[0]
      if (!ownsTransaction && !callerState) throw new Error('Unable to read nested role session state')
      await client.query(ownsTransaction ? 'BEGIN' : `SAVEPOINT ${savepoint}`)
      try {
        await client.query(`SET LOCAL ROLE ${role}`)
        await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({sub: actor.subject})])
        const result = await callback(client)
        if (ownsTransaction) {
          await client.query('COMMIT')
        } else {
          await client.query("SELECT set_config('role', $1, true)", [callerState!.role])
          await client.query("SELECT set_config('request.jwt.claims', $1, true)", [callerState!.claims ?? ''])
          await client.query(`RELEASE SAVEPOINT ${savepoint}`)
        }
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

export function createActorSession(
  pool: QueryPool,
  options: RoleSessionOptions = {transactionMode: 'owned'},
): {withActor: WithActor} {
  return {withActor: createRoleSession(pool, 'aifans_authenticated', options)}
}

export function createPlatformSession(
  pool: QueryPool,
  options: RoleSessionOptions = {transactionMode: 'owned'},
): {withPlatformActor: WithPlatformActor} {
  return {withPlatformActor: createRoleSession(pool, 'aifans_platform', options)}
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
