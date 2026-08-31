import type {Actor} from '@aifans/db'

export type AuthorityPort = {
  isCurrentActorOperator(actor: Actor): Promise<boolean>
}
