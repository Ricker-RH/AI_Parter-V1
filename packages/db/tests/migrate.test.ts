import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {discoverMigrations} from '../src/migrate.js'
import {readDatabaseEnv} from '../src/env.js'

describe('database environment', () => {
  it('requires a postgres URL and falls back to it for administration', () => {
    const result = readDatabaseEnv({DATABASE_URL: 'postgresql://app@localhost/aifans'})
    expect(result).toEqual({
      databaseUrl: 'postgresql://app@localhost/aifans',
      adminUrl: 'postgresql://app@localhost/aifans',
    })
  })

  it('rejects non-postgres URLs', () => {
    expect(() => readDatabaseEnv({DATABASE_URL: 'https://example.com'})).toThrow(
      'DATABASE_URL',
    )
  })
})

describe('migration discovery', () => {
  it('sorts SQL files and includes a stable SHA-256 checksum', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aifans-migrations-'))
    writeFileSync(join(directory, '202608310002_second.sql'), 'select 2;\n')
    writeFileSync(join(directory, '202608310001_first.sql'), 'select 1;\n')

    const migrations = discoverMigrations(directory)
    expect(migrations.map(({name}) => name)).toEqual([
      '202608310001_first.sql',
      '202608310002_second.sql',
    ])
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('ignores filenames without a twelve-digit prefix', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aifans-migrations-'))
    writeFileSync(join(directory, '001_legacy.sql'), 'select 1;\n')

    expect(discoverMigrations(directory)).toEqual([])
  })
})
