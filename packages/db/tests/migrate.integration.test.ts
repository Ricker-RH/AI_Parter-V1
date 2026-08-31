import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterEach, describe, expect, it} from 'vitest'
import {migrate} from '../src/migrate.js'

const connectionString = process.env.DATABASE_URL ?? ''
const describeIntegration = connectionString ? describe : describe.skip

describeIntegration('migration runner integration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aifans-migration-integration-'))
  const suffix = randomUUID().replaceAll('-', '')
  const firstName = `209912310001_first_${suffix}.sql`
  const secondName = `209912310002_second_${suffix}.sql`
  const firstTable = `aifans_migration_first_${suffix}`
  const secondTable = `aifans_migration_second_${suffix}`
  const firstPath = join(directory, firstName)
  const secondPath = join(directory, secondName)
  const firstSql = `CREATE TABLE ${firstTable} (id integer PRIMARY KEY);\n`
  const pool = new Pool({connectionString})

  afterEach(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${firstTable}`)
    await pool.query(`DROP TABLE IF EXISTS ${secondTable}`)
    await pool.query(
      'DELETE FROM app_migrations.schema_migrations WHERE name = ANY($1::text[])',
      [[firstName, secondName]],
    )
    rmSync(directory, {recursive: true, force: true})
    await pool.end()
  })

  it('applies safely, rejects changed checksums, rolls back failures, and releases resources', async () => {
    writeFileSync(firstPath, firstSql)

    await expect(migrate({connectionString, directory})).resolves.toEqual([firstName])
    await expect(migrate({connectionString, directory})).resolves.toEqual([])

    writeFileSync(firstPath, `CREATE TABLE ${firstTable} (id text PRIMARY KEY);\n`)
    await expect(migrate({connectionString, directory})).rejects.toThrow('checksum mismatch')
    writeFileSync(firstPath, firstSql)

    writeFileSync(secondPath, `CREATE TABLE ${secondTable} (id integer PRIMARY KEY);\nINVALID SQL;\n`)
    await expect(migrate({connectionString, directory})).rejects.toThrow()
    await expect(
      pool.query<{exists: string | null}>('SELECT to_regclass($1) AS exists', [secondTable]),
    ).resolves.toMatchObject({rows: [{exists: null}]})
    await expect(
      pool.query('SELECT name FROM app_migrations.schema_migrations WHERE name = $1', [secondName]),
    ).resolves.toMatchObject({rowCount: 0})

    writeFileSync(secondPath, `CREATE TABLE ${secondTable} (id integer PRIMARY KEY);\n`)
    await expect(migrate({connectionString, directory})).resolves.toEqual([secondName])
  })
})
