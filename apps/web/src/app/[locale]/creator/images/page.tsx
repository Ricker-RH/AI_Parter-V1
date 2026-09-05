import {connection} from 'next/server'
import {notFound} from 'next/navigation'
import {getMessages,isLocale} from '../../../../i18n/config'
import {requireAuthenticatedPage} from '../../../../lib/auth/access-policy'
import {isCreatorModeEnabled} from '../../../../lib/creator-mode'
import {CreatorImages} from '../../../../components/creator/CreatorImages'
export const instant=false
export default async function ImagesPage({params}:{params:Promise<{locale:string}>}) {
  await connection()
  const {locale}=await params
  if(!isLocale(locale)||!isCreatorModeEnabled())notFound()
  const messages=await getMessages(locale)
  const access=await requireAuthenticatedPage({locale,returnTo:`/${locale}/creator/images`})
  if(access.status==='unavailable')return <p role="alert">{messages.creator.unavailable}</p>
  return <CreatorImages locale={locale}/>
}
