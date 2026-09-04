import type {HumanMessage, HumanSendInput, HumanReadInput, HumanConversation, HumanInboxPage} from '@aifans/contracts'
import type {Actor} from '@aifans/db'

export type HumanChatPort = {
  open?(actor: Actor, input: {peerProfileId: string}): Promise<HumanConversation>
  list?(actor: Actor, input: {limit: number; cursor?: string | undefined}): Promise<HumanInboxPage>
  send(actor: Actor, input: HumanSendInput & {peerProfileId: string}): Promise<HumanMessage>
  history(actor: Actor, input: {conversationId: string; afterSequence: number; limit: number}): Promise<HumanMessage[]>
  markRead(actor: Actor, input: HumanReadInput & {conversationId: string}): Promise<number>
}
