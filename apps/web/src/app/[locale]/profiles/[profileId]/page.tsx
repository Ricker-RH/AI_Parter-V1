import {notFound} from 'next/navigation'
import {PublicProfileContent} from '../../../../components/social/PublicProfileContent'
import {getMessages,isLocale} from '../../../../i18n/config'
import {requestCookie} from '../../../../lib/request-cookie'
import {fetchPublicProfile} from '../../../../lib/social-api'

export default async function PublicProfilePage({params,searchParams}:{params:Promise<{locale:string;profileId:string}>;searchParams:Promise<{cursor?:string}>}) {
  const {locale,profileId}=await params
  if(!isLocale(locale))notFound()
  const {cursor}=await searchParams
  const [messages,cookie]=await Promise.all([getMessages(locale),requestCookie()])
  const result=await fetchPublicProfile(profileId,{cookie,cursor})
  const nextCursor=result.status==='ok'?result.data.posts.nextCursor:null
  const moreHref=nextCursor?`/${locale}/profiles/${profileId}?${new URLSearchParams({cursor:nextCursor})}`:undefined
  return <main><PublicProfileContent labels={messages} locale={locale} result={result} {...(moreHref?{moreHref}:{})}/></main>
}
