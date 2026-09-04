import type {Actor} from '@aifans/db'
import type {HumanShareTargetQuery,HumanShareTargetPage,HumanShareRecipientPage,HumanShareTarget,HumanShareResolution} from '@aifans/contracts'
export type HumanChatRichContentPort={
 listTargets(actor:Actor,input:HumanShareTargetQuery):Promise<HumanShareTargetPage>
 listShareRecipients(actor:Actor):Promise<HumanShareRecipientPage>
 resolveTarget(actor:Actor,input:HumanShareTarget):Promise<HumanShareResolution>
}
