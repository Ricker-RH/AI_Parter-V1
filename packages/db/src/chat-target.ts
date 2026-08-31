import type {Actor, WithActor} from './session.js'
import {withActor} from './session.js'

export type ChatTargetRepository = {
  isPublicChatIp(actor: Actor, ipProfileId: string): Promise<boolean>
}

export function createChatTargetRepository(runWithActor: WithActor): ChatTargetRepository {
  return {
    async isPublicChatIp(actor, ipProfileId) {
      return runWithActor(actor, async (client) => {
        const result = await client.query<{available: boolean}>(
          'SELECT public.is_public_chat_ip($1) AS available',
          [ipProfileId],
        )
        return result.rows[0]?.available === true
      })
    },
  }
}

export async function isPublicChatIp(actor: Actor, ipProfileId: string): Promise<boolean> {
  return createChatTargetRepository(withActor).isPublicChatIp(actor, ipProfileId)
}
