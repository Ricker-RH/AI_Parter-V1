import {notFound} from 'next/navigation'
import {CreatorCenter} from '../../../components/creator/CreatorCenter'
import {getMessages,isLocale} from '../../../i18n/config'
import {isCreatorModeEnabled} from '../../../lib/creator-mode'
export default async function CreatorPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isCreatorModeEnabled()||!isLocale(locale))notFound();const messages=await getMessages(locale);return <CreatorCenter labels={messages.creator} locale={locale}/>}
