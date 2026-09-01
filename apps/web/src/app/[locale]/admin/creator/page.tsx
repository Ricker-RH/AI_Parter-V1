import {notFound,redirect} from 'next/navigation'
import {CreatorReviewConsole} from '../../../../components/creator/CreatorReviewConsole'
import {getMessages,isLocale} from '../../../../i18n/config'
import {isCreatorModeEnabled} from '../../../../lib/creator-mode'
import {getOperatorPageAccess} from '../../../../lib/operator-access'
export const dynamic='force-dynamic'
export default async function CreatorAdminPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isCreatorModeEnabled()||!isLocale(locale))notFound();const messages=await getMessages(locale);const access=await getOperatorPageAccess();if(access==='anonymous')redirect(`/${locale}/auth/sign-in`);if(access!=='operator'){const message=access==='forbidden'?messages.admin.operatorRequired:messages.admin.serviceUnavailable;return <main className="creator-page"><p className="creator-notice" role="alert">{message}</p></main>}return <CreatorReviewConsole labels={messages.creatorAdmin}/>}
