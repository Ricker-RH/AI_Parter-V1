import type {HumanProfile, HumanPreferencesUpdateInput, HumanVisibility} from '@aifans/contracts'
import type {Actor} from '@aifans/db'

export type HumanSocialPort = {
  getPreferences(actor:Actor):Promise<{visibility:HumanVisibility;showPresence:boolean}>
  getPublicProfile(input: {viewer: Actor | null; profileId: string}): Promise<HumanProfile | null>
  setPreferences(actor: Actor, input: HumanPreferencesUpdateInput): Promise<{visibility: HumanVisibility; showPresence: boolean}>
  follow(actor: Actor, targetProfileId: string): Promise<{changed: boolean}>
  unfollow(actor: Actor, targetProfileId: string): Promise<{changed: boolean}>
  block(actor: Actor, targetProfileId: string): Promise<{changed: boolean}>
  unblock(actor: Actor, targetProfileId: string): Promise<{changed: boolean}>
}
