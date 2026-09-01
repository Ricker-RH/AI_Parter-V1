import {notFound} from 'next/navigation'
import {CreatorReviewConsole} from '../../../../components/creator/CreatorReviewConsole'
import {getMessages,isLocale} from '../../../../i18n/config'
import {isCreatorModeEnabled} from '../../../../lib/creator-mode'
export default async function CreatorAdminPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isCreatorModeEnabled()||!isLocale(locale))notFound();const messages=await getMessages(locale);return <CreatorReviewConsole labels={messages.creatorAdmin}/>}
