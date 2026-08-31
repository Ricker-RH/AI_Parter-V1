import {EmptyState} from '@aifans/ui'
import {pageMessages} from '../../page-messages'
export default async function ProfilePage({params}: {params: Promise<{locale: string}>}) { const m = await pageMessages(params); return <main><header className="page-header"><h1 className="page-title">{m.profile}</h1></header><EmptyState description={m.profileEmptyDescription} title={m.profileEmptyTitle} /></main> }
