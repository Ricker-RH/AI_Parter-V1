import {describe, expect, it} from 'vitest'
import {createActorSession, createPlatformSession, type QueryClient} from '../src/session.js'

function recordingPool() {
  const calls: Array<{text: string; values?: unknown[]}> = []
  let released = 0
  const client: QueryClient = {
    async query(text, values) {
      calls.push({text, values})
      return (text === 'SELECT 1'
        ? {rows: [{value: 1}], rowCount: 1}
        : {rows: [], rowCount: null}) as never
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

  it('uses an explicit savepoint and clears role and claims before returning to its owner', async () => {
    const recording = recordingPool()
    const session = createPlatformSession(recording.pool, {transactionMode: 'nested'})

    await expect(session.withPlatformActor({subject: 'operator-1'}, (client) => client.query('SELECT 1'))).resolves.toMatchObject({rows: [{value: 1}]})

    expect(recording.calls.map(({text}) => text)).toEqual([
      'SAVEPOINT platform_session',
      'SET LOCAL ROLE aifans_platform',
      "SELECT set_config('request.jwt.claims', $1, true)",
      'SELECT 1',
      'SET LOCAL ROLE NONE',
      "SELECT set_config('request.jwt.claims', '', true)",
      'RELEASE SAVEPOINT platform_session',
    ])
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
    expect(recording.calls.slice(-2).map(({text}) => text)).toEqual([
      'ROLLBACK TO SAVEPOINT platform_session',
      'RELEASE SAVEPOINT platform_session',
    ])
    expect(recording.released()).toBe(1)
  })
})
