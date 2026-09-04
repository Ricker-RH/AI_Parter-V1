import type {HumanMessage, HumanSendInput, HumanReadInput} from '@aifans/contracts'
import type {Actor} from '@aifans/db'

export type HumanChatPort = {
  send(actor: Actor, input: HumanSendInput & {peerProfileId: string}): Promise<HumanMessage>
  history(actor: Actor, input: {conversationId: string; afterSequence: number; limit: number}): Promise<HumanMessage[]>
  markRead(actor: Actor, input: HumanReadInput & {conversationId: string}): Promise<number>
}
