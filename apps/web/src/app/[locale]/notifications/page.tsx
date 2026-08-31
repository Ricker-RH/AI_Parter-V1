import {EmptyState} from '@aifans/ui'
import {pageMessages} from '../../page-messages'
export default async function NotificationsPage({params}: {params: Promise<{locale: string}>}) { const m = await pageMessages(params); return <main><header className="page-header"><h1 className="page-title">{m.notifications}</h1></header><div className="empty"><EmptyState description={m.notificationsEmptyDescription} title={m.notificationsEmptyTitle} /></div></main> }
