import {notFound,redirect} from 'next/navigation'
import {connection} from 'next/server'
import {CreatorReviewConsole} from '../../../../components/creator/CreatorReviewConsole'
import {getMessages,isLocale} from '../../../../i18n/config'
import {isCreatorModeEnabled} from '../../../../lib/creator-mode'
import {getOperatorPageAccess} from '../../../../lib/operator-access'
// Authorization is request-scoped and has not been migrated to a streaming boundary.
export const instant = false
export default async function CreatorAdminPage({params}:{params:Promise<{locale:string}>}){await connection();const {locale}=await params;if(!isCreatorModeEnabled()||!isLocale(locale))notFound();const messages=await getMessages(locale);const access=await getOperatorPageAccess();if(access==='anonymous')redirect(`/${locale}/auth/sign-in?next=${encodeURIComponent(`/${locale}/admin/creator`)}`);if(access!=='operator'){const message=access==='forbidden'?messages.admin.operatorRequired:messages.admin.serviceUnavailable;return <main className="creator-page"><p className="creator-notice" role="alert">{message}</p></main>}return <CreatorReviewConsole labels={messages.creatorAdmin}/>}
