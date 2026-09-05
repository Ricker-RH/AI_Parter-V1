import {connection} from 'next/server'
import {notFound} from 'next/navigation'
import {getMessages,isLocale} from '../../../../i18n/config'
import {requireAuthenticatedPage} from '../../../../lib/auth/access-policy'
import {isCreatorModeEnabled} from '../../../../lib/creator-mode'
import {CreatorCenter} from '../../../../components/creator/CreatorCenter'
export const instant=false
export default async function StudioPage({params}:{params:Promise<{locale:string}>}) {
  await connection()
  const {locale}=await params
  if(!isLocale(locale)||!isCreatorModeEnabled())notFound()
  const messages=await getMessages(locale)
  const access=await requireAuthenticatedPage({locale,returnTo:`/${locale}/creator/studio`})
  if(access.status==='unavailable')return <p role="alert">{messages.creator.unavailable}</p>
  return <CreatorCenter locale={locale} labels={messages.creator} workspace/>
}
