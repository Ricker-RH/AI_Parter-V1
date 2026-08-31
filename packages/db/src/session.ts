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

function requirePostgresUrl(name: 'DATABASE_USER_URL' | 'DATABASE_ADMIN_URL'): string {
  const value = process.env[name]
  try {
    const {protocol} = new URL(value ?? '')
    if (protocol === 'postgres:' || protocol === 'postgresql:') return value!
  } catch {
    // Fall through to the single redacted error below.
  }
  throw new Error(`${name} must be a valid postgres URL`)
}

export function createActorSession(pool: QueryPool): {withActor: WithActor} {
  return {
    async withActor<T>(actor: Actor, callback: (client: QueryClient) => Promise<T>): Promise<T> {
      if (!actor.subject.trim()) {
        throw new Error('Actor subject must not be blank')
      }

      const client = await pool.connect()
      const transaction = await client.query<{txid: string | null}>(
        'SELECT txid_current_if_assigned() AS txid',
      )
      const ownsTransaction = transaction.rows[0]?.txid === null
      try {
        await client.query(ownsTransaction ? 'BEGIN' : 'SAVEPOINT actor_session')
        try {
          await client.query('SET LOCAL ROLE aifans_authenticated')
          await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({sub: actor.subject}),
          ])
          const result = await callback(client)
          await client.query(ownsTransaction ? 'COMMIT' : 'RELEASE SAVEPOINT actor_session')
          if (!ownsTransaction) await client.query('SET LOCAL ROLE NONE')
          return result
        } catch (error) {
          await client.query(ownsTransaction ? 'ROLLBACK' : 'ROLLBACK TO SAVEPOINT actor_session').catch(() => undefined)
          if (!ownsTransaction) await client.query('RELEASE SAVEPOINT actor_session').catch(() => undefined)
          throw error
        }
      } finally {
        client.release()
      }
    },
  }
}

let userPool: Pool | undefined

function getUserPool(): Pool {
  userPool ??= new Pool({connectionString: requirePostgresUrl('DATABASE_USER_URL')})
  return userPool
}

export async function withActor<T>(
  actor: Actor,
  callback: (client: QueryClient) => Promise<T>,
): Promise<T> {
  return createActorSession(getUserPool()).withActor(actor, callback)
}
