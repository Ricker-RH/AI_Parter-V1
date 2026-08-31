import {notFound} from 'next/navigation'
import {CreatorReviewConsole} from '../../../../components/creator/CreatorReviewConsole'
import {getMessages,isLocale} from '../../../../i18n/config'
export default async function CreatorAdminPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();const messages=await getMessages(locale);return <CreatorReviewConsole labels={messages.creatorAdmin}/>}
