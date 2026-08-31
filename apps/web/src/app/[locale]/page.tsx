import {EmptyState} from '@aifans/ui'
import {getMessages, isLocale} from '../../i18n/config'
import {notFound} from 'next/navigation'

export default async function HomePage({params}: {params: Promise<{locale: string}>}) {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  return <main><header className="page-header"><h1 className="page-title">{messages.home}</h1><div aria-label={messages.home} className="tabs" role="tablist"><button aria-selected="true" className="tab" role="tab" type="button">{messages.forYou}</button><button aria-selected="false" className="tab" role="tab" type="button">{messages.following}</button></div></header><EmptyState description={messages.homeEmptyDescription} title={messages.homeEmptyTitle} /></main>
}
