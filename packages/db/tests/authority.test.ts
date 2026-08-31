import {describe, expect, it} from 'vitest'
import {createAuthorityRepository} from '../src/authority.js'

describe('authority configuration boundaries', () => {
  it('checks operator authority through the actor session without an admin pool', async () => {
    const previous = process.env.DATABASE_ADMIN_URL
    delete process.env.DATABASE_ADMIN_URL
    try {
      const repository = createAuthorityRepository({
        withActor: async (_actor, callback) => callback({
          query: async () => ({rows: [{current_operator: true}], rowCount: 1}),
          release() {},
        }),
      })

      await expect(repository.isCurrentActorOperator({subject: 'operator'})).resolves.toBe(true)
    } finally {
      if (previous === undefined) delete process.env.DATABASE_ADMIN_URL
      else process.env.DATABASE_ADMIN_URL = previous
    }
  })

  it('requires an explicit admin pool only for granting authority', async () => {
    const repository = createAuthorityRepository({
      withActor: async (_actor, callback) => callback({
        query: async () => ({rows: [{current_operator: false}], rowCount: 1}),
        release() {},
      }),
    })

    await expect(repository.grantOperator({authSubject: 'subject', grantedByAuthSubject: 'grantor'})).rejects.toThrow('Admin database pool is required')
  })
})
