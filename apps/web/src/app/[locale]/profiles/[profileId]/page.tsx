import {notFound} from 'next/navigation'
import {PublicProfileContent} from '../../../../components/social/PublicProfileContent'
import {getMessages,isLocale} from '../../../../i18n/config'
import {fetchPublicProfile} from '../../../../lib/social-api'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../../lib/auth/access-policy'

export const instant = false

export default async function PublicProfilePage({params,searchParams}:{params:Promise<{locale:string;profileId:string}>;searchParams:Promise<{cursor?:string}>}) {
  const {locale,profileId}=await params
  if(!isLocale(locale))notFound()
  const {cursor}=await searchParams
  const access=await requireAuthenticatedPage({locale,returnTo:`/${locale}/profiles/${profileId}${cursor?`?${new URLSearchParams({cursor})}`:''}`})
  const messages=await getMessages(locale)
  if(access.status==='unavailable')return <main><PublicProfileContent labels={messages} locale={locale} result={{status:'unavailable'}}/></main>
  const result=await fetchPublicProfile(profileId,{cursor,token:access.token})
  if(result.status==='auth-required')redirectToUserSignIn({locale,returnTo:`/${locale}/profiles/${profileId}${cursor?`?${new URLSearchParams({cursor})}`:''}`})
  const nextCursor=result.status==='ok'?result.data.posts.nextCursor:null
  const moreHref=nextCursor?`/${locale}/profiles/${profileId}?${new URLSearchParams({cursor:nextCursor})}`:undefined
  return <main><PublicProfileContent labels={messages} locale={locale} result={result} {...(moreHref?{moreHref}:{})}/></main>
}
