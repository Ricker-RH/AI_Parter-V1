import type {Actor} from '@aifans/db'
import type {HumanShareTargetQuery,HumanShareTargetPage,HumanShareTarget,HumanShareResolution} from '@aifans/contracts'
export type HumanChatRichContentPort={
 listTargets(actor:Actor,input:HumanShareTargetQuery):Promise<HumanShareTargetPage>
 resolveTarget(actor:Actor,input:HumanShareTarget):Promise<HumanShareResolution>
}
