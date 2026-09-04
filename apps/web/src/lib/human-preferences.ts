import {HumanPreferencesUpdateInputSchema,type HumanPreferencesUpdateInput} from '@aifans/contracts'
export type HumanPreferences=Required<HumanPreferencesUpdateInput>
export function parseHumanPreferences(value:unknown):HumanPreferences|null{
 const parsed=HumanPreferencesUpdateInputSchema.safeParse(value)
 if(!parsed.success||parsed.data.visibility===undefined||parsed.data.showPresence===undefined)return null
 return {visibility:parsed.data.visibility,showPresence:parsed.data.showPresence}
}
