import {describe, expect, it} from 'vitest'
import {createActorSession, createPlatformSession, type QueryClient} from '../src/session.js'

function recordingPool() {
  const calls: Array<{text: string; values?: unknown[]}> = []
  let released = 0
  const client: QueryClient = {
    async query(text, values) {
      calls.push({text, values})
      if (text === 'SELECT 1') return {rows: [{value: 1}], rowCount: 1} as never
      if (text === "SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims") {
        return {rows: [{role: 'aifans_anon', claims: '{"sub":"outer"}'}], rowCount: 1} as never
      }
      return {rows: [], rowCount: null} as never
    },
    release() { released += 1 },
  }
  return {pool: {connect: async () => client}, calls, released: () => released}
}

describe('role sessions', () => {
  it('owns a transaction explicitly and relies on transaction completion for cleanup', async () => {
    const recording = recordingPool()
    const session = createActorSession(recording.pool, {transactionMode: 'owned'})

    await expect(session.withActor({subject: 'human-1'}, (client) => client.query('SELECT 1'))).resolves.toMatchObject({rows: [{value: 1}]})

    expect(recording.calls.map(({text}) => text)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE aifans_authenticated',
      "SELECT set_config('request.jwt.claims', $1, true)",
      'SELECT 1',
      'COMMIT',
    ])
    expect(recording.released()).toBe(1)
  })

  it('restores the exact caller role and claims after a successful nested session', async () => {
    const recording = recordingPool()
    const session = createPlatformSession(recording.pool, {transactionMode: 'nested'})

    await expect(session.withPlatformActor({subject: 'operator-1'}, (client) => client.query('SELECT 1'))).resolves.toMatchObject({rows: [{value: 1}]})

    expect(recording.calls.map(({text}) => text)).toEqual([
      "SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims",
      'SAVEPOINT platform_session',
      'SET LOCAL ROLE aifans_platform',
      "SELECT set_config('request.jwt.claims', $1, true)",
      'SELECT 1',
      "SELECT set_config('role', $1, true)",
      "SELECT set_config('request.jwt.claims', $1, true)",
      'RELEASE SAVEPOINT platform_session',
    ])
    expect(recording.calls.at(-3)?.values).toEqual(['aifans_anon'])
    expect(recording.calls.at(-2)?.values).toEqual(['{"sub":"outer"}'])
    expect(recording.released()).toBe(1)
  })

  it('rolls back an owned transaction and releases its connection when the callback fails', async () => {
    const recording = recordingPool()
    const session = createActorSession(recording.pool, {transactionMode: 'owned'})

    await expect(session.withActor({subject: 'human-1'}, async () => { throw new Error('stop') })).rejects.toThrow('stop')
    expect(recording.calls.at(-1)?.text).toBe('ROLLBACK')
    expect(recording.released()).toBe(1)
  })

  it('rolls back and releases a nested savepoint when the callback fails', async () => {
    const recording = recordingPool()
    const session = createPlatformSession(recording.pool, {transactionMode: 'nested'})

    await expect(session.withPlatformActor({subject: 'operator-1'}, async () => { throw new Error('stop') })).rejects.toThrow('stop')
    expect(recording.calls.map(({text}) => text)).toEqual([
      "SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims",
      'SAVEPOINT platform_session',
      'SET LOCAL ROLE aifans_platform',
      "SELECT set_config('request.jwt.claims', $1, true)",
      'ROLLBACK TO SAVEPOINT platform_session',
      'RELEASE SAVEPOINT platform_session',
    ])
    expect(recording.released()).toBe(1)
  })
})
