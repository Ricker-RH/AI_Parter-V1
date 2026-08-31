import {createHash} from 'node:crypto'
import {readFileSync, readdirSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Pool, type PoolClient} from 'pg'
import {readDatabaseEnv} from './env.js'

const advisoryLockId = 947361204
const migrationName = /^\d{12}_[a-z0-9_]+\.sql$/

export type Migration = {
  name: string
  sql: string
  checksum: string
}

export type MigrateOptions = {
  connectionString: string
  directory: string
}

export function discoverMigrations(directory: string): Migration[] {
  return readdirSync(directory)
    .filter((name) => migrationName.test(name))
    .sort()
    .map((name) => {
      const sql = readFileSync(resolve(directory, name), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      return {name, sql, checksum}
    })
}

export async function migrate({connectionString, directory}: MigrateOptions): Promise<string[]> {
  const pool = new Pool({connectionString})

  try {
    const client: PoolClient = await pool.connect()
    try {
      await client.query('SELECT pg_advisory_lock($1)', [advisoryLockId])
      await client.query(
        'CREATE SCHEMA IF NOT EXISTS app_migrations; CREATE TABLE IF NOT EXISTS app_migrations.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
      )

      const migrations = discoverMigrations(directory)
      const applied = await client.query<{name: string; checksum: string}>(
        'SELECT name, checksum FROM app_migrations.schema_migrations',
      )
      const appliedByName = new Map(applied.rows.map((row) => [row.name, row.checksum]))
      const newMigrationNames: string[] = []

      for (const migration of migrations) {
        const existingChecksum = appliedByName.get(migration.name)
        if (existingChecksum !== undefined) {
          if (existingChecksum !== migration.checksum) {
            throw new Error(`Migration checksum mismatch for ${migration.name}`)
          }
          continue
        }

        await client.query('BEGIN')
        try {
          await client.query(migration.sql)
          await client.query(
            'INSERT INTO app_migrations.schema_migrations (name, checksum) VALUES ($1, $2)',
            [migration.name, migration.checksum],
          )
          await client.query('COMMIT')
          newMigrationNames.push(migration.name)
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      }

      return newMigrationNames
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockId]).catch(() => undefined)
      client.release()
    }
  } finally {
    await pool.end()
  }
}

async function main(): Promise<void> {
  const {adminUrl} = readDatabaseEnv(process.env)
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')
  const migrations = await migrate({connectionString: adminUrl, directory})
  for (const name of migrations) {
    console.log(name)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    console.error('Migration failed.')
    process.exitCode = 1
  })
}
