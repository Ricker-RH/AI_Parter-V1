import {EmptyState} from '@aifans/ui'
import {pageMessages} from '../../page-messages'
export default async function MessagesPage({params}: {params: Promise<{locale: string}>}) { const m = await pageMessages(params); return <main><header className="page-header"><h1 className="page-title">{m.messages}</h1></header><EmptyState description={m.messagesEmptyDescription} title={m.messagesEmptyTitle} /></main> }
