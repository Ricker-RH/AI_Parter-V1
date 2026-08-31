import {Pool} from '@neondatabase/serverless'
import {createAuthorityRepository, type AuthorityRepository} from './authority.js'
import {createChatTargetRepository, type ChatTargetRepository} from './chat-target.js'
import {createProfileRepository, type ProfileRepository} from './profiles.js'
import {
  createPlatformSocialRepository,
  createSocialRepository,
  type PlatformSocialRepository,
  type SocialRepository,
} from './social.js'
import {createActorSession, createPlatformSession, type QueryClient} from './session.js'

export type DatabaseRuntimeUrls = {
  userUrl: string
  platformUrl: string
  provisioningUrl: string
}

export type DatabaseRuntimeRepositories = {
  authority: AuthorityRepository
  platformSocial: PlatformSocialRepository
  profiles: ProfileRepository
  social: SocialRepository
  chatTargets: ChatTargetRepository
}

function postgresUrl(value: string): string {
  const protocol = new URL(value).protocol
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') throw new Error('Database runtime URL must use postgres')
  return value
}

export function createDatabaseRuntimeRepositories(urls: DatabaseRuntimeUrls): DatabaseRuntimeRepositories {
  const userPool = new Pool({connectionString: postgresUrl(urls.userUrl)})
  const platformPool = new Pool({connectionString: postgresUrl(urls.platformUrl)})
  const provisioningPool = new Pool({connectionString: postgresUrl(urls.provisioningUrl)})
  const {withActor} = createActorSession(userPool)
  const {withPlatformActor} = createPlatformSession(platformPool)
  const withPublic = async <T>(callback: (client: QueryClient) => Promise<T>): Promise<T> => {
    const client = await userPool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE aifans_anon')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
  return {
    authority: createAuthorityRepository({withActor}),
    platformSocial: createPlatformSocialRepository({withPlatformActor}),
    profiles: createProfileRepository({adminPool: provisioningPool, withActor}),
    social: createSocialRepository({withActor, withPublic}),
    chatTargets: createChatTargetRepository(withActor),
  }
}
