import type {Actor} from '@aifans/db'

export type ChatTargetPort = {
  isPublicChatIp(actor: Actor, ipProfileId: string): Promise<boolean>
}
