import {afterEach, describe, expect, it} from 'vitest'
import {createSocialRepository} from '../src/social.js'

const previousUser = process.env.DATABASE_USER_URL
const previousOwner = process.env.DATABASE_URL

afterEach(() => {
  if (previousUser === undefined) delete process.env.DATABASE_USER_URL
  else process.env.DATABASE_USER_URL = previousUser
  if (previousOwner === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousOwner
})

describe('social database credential boundary', () => {
  it('constructs lazily and never falls back to DATABASE_URL', async () => {
    delete process.env.DATABASE_USER_URL
    process.env.DATABASE_URL = 'postgresql://owner:secret@db.example/aifans'
    const repository = createSocialRepository()
    await expect(repository.listFeed({viewer: null, kind: 'for_you', visualType: 'all', limit: 1, after: null})).rejects.toThrow('DATABASE_USER_URL must be a valid postgres URL')
  })
})
