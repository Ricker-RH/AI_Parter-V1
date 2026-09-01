import {notFound} from 'next/navigation'
import {CreatorCenter} from '../../../components/creator/CreatorCenter'
import {getMessages,isLocale} from '../../../i18n/config'
import {isCreatorModeEnabled} from '../../../lib/creator-mode'
import {requireAuthenticatedPage} from '../../../lib/auth/access-policy'
export default async function CreatorPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isCreatorModeEnabled()||!isLocale(locale))notFound();const messages=await getMessages(locale);const access=await requireAuthenticatedPage({locale,returnTo:`/${locale}/creator`});if(access.status==='unavailable')return <main className="creator-page"><p className="creator-notice" role="alert">{messages.creator.unavailable}</p></main>;return <CreatorCenter labels={messages.creator} locale={locale}/>}
