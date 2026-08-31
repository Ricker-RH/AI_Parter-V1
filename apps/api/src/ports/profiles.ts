import type {Account} from '@aifans/contracts'
import type {Actor, EnsureHumanProfileInput} from '@aifans/db'

export type ProfilePort = {
  ensureHumanProfile(input: EnsureHumanProfileInput): Promise<unknown>
  getCurrentAccount(actor: Actor | null): Promise<Account | null>
}
