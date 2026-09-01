import {EmptyState} from '@aifans/ui'
import {notFound} from 'next/navigation'
import {getMessages, isLocale} from '../../../i18n/config'
export default async function SearchPage({params}: {params: Promise<{locale: string}>}) { const {locale} = await params; if (!isLocale(locale)) notFound(); const m = await getMessages(locale); return <main><header className="page-header"><h1 className="page-title">{m.search}</h1></header><div className="empty"><EmptyState description={m.searchEmptyDescription} title={m.searchEmptyTitle} /></div></main> }
