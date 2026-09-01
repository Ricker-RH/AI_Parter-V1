import type {Account} from '@aifans/contracts'
import type {Actor, EnsureHumanProfileInput} from '@aifans/db'
import type {UpdateCurrentAccount} from '@aifans/contracts'

export type ProfilePort = {
  ensureHumanProfile(input: EnsureHumanProfileInput): Promise<unknown>
  getCurrentAccount(actor: Actor | null): Promise<Account | null>
  updateCurrentAccount?(actor: Actor | null, input: UpdateCurrentAccount): Promise<Account | null>
}
