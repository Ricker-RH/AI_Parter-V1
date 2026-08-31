import {EmptyState} from '@aifans/ui'
import Link from 'next/link'
import {getMessages, isLocale} from '../../i18n/config'
import {notFound} from 'next/navigation'

export default async function HomePage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{feed?: string}>}) {
  const {locale: candidate} = await params
  if (!isLocale(candidate)) notFound()
  const messages = await getMessages(candidate)
  const following = (await searchParams).feed === 'following'
  return <main><header className="page-header"><h1 className="page-title">{messages.home}</h1><div aria-label={messages.home} className="tabs" role="tablist"><Link aria-selected={!following} className="tab" href={`/${candidate}`} role="tab">{messages.forYou}</Link><Link aria-selected={following} className="tab" href={`/${candidate}?feed=following`} role="tab">{messages.following}</Link></div></header><div className="empty"><EmptyState description={messages.homeEmptyDescription} title={messages.homeEmptyTitle} /></div></main>
}
