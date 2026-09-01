import {EmptyState} from '@aifans/ui'
import {notFound} from 'next/navigation'
import {getMessages, isLocale} from '../../../i18n/config'
import {requireAuthenticatedPage} from '../../../lib/auth/access-policy'
export default async function SearchPage({params}: {params: Promise<{locale: string}>}) { const {locale} = await params; if (!isLocale(locale)) notFound(); const m = await getMessages(locale); const access = await requireAuthenticatedPage({locale, returnTo: `/${locale}/search`}); if (access.status === 'unavailable') return <main><div className="empty"><EmptyState description={m.unavailableDescription} title={m.unavailableTitle} /></div></main>; return <main><header className="page-header"><h1 className="page-title">{m.search}</h1></header><div className="empty"><EmptyState description={m.searchEmptyDescription} title={m.searchEmptyTitle} /></div></main> }
