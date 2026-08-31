import {createAuthorityRepository} from '@aifans/db'
import type {QueryPool} from '@aifans/db'
import type {AuthorityPort} from './authority.js'

const unusedAdminPool: QueryPool = {
  connect: async () => {
    throw new Error('Admin database access is unavailable to authority checks')
  },
}
const authority = createAuthorityRepository({adminPool: unusedAdminPool})

function requireUserDatabaseUrl(): void {
  const value = process.env.DATABASE_USER_URL
  try {
    const {protocol} = new URL(value ?? '')
    if (protocol === 'postgres:' || protocol === 'postgresql:') return
  } catch {
    // Use the single redacted configuration error below.
  }
  throw new Error('DATABASE_USER_URL must be a valid postgres URL')
}

export const databaseAuthorityPort: AuthorityPort = {
  async isCurrentActorOperator(actor) {
    requireUserDatabaseUrl()
    return authority.isCurrentActorOperator(actor)
  },
}
