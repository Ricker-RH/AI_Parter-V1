import {CreatorDraftSchema} from '@aifans/contracts'
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {CreatorDraftForm} from '../../../../components/creator/CreatorDraftForm'
import {getMessages,isLocale} from '../../../../i18n/config'
import {fetchAifansApi} from '../../../../lib/server-api'
import {isCreatorModeEnabled} from '../../../../lib/creator-mode'
export default async function CreatorDraftPage({params}:{params:Promise<{locale:string;draftId:string}>}){const {locale,draftId}=await params;if(!isCreatorModeEnabled()||!isLocale(locale))notFound();const messages=await getMessages(locale);let draft;try{const response=await fetchAifansApi(`/v1/creator/drafts/${encodeURIComponent(draftId)}`);if(response.status===404)notFound();if(!response.ok)throw new Error('unavailable');draft=CreatorDraftSchema.parse(await response.json())}catch(error){if((error as {digest?:string}).digest?.startsWith('NEXT_HTTP_ERROR_FALLBACK;404'))throw error;return <main className="creator-page"><header className="creator-hero"><div><h1>{messages.creator.title}</h1></div></header><p className="creator-notice" role="alert">{messages.creator.unavailable}</p></main>}return <main className="creator-page"><Link className="creator-back" href={`/${locale}/creator`}>← {messages.creator.back}</Link><CreatorDraftForm draft={draft} labels={messages.creator} locale={locale}/></main>}
