import {HumanProfileSchema} from '@aifans/contracts'
import Link from 'next/link'
import {notFound,redirect} from 'next/navigation'
import {HumanProfilePanel} from '../../../../components/profile/HumanProfilePanel'
import {humanProfileLabels} from '../../../../components/profile/human-profile-labels'
import {getMessages,isLocale} from '../../../../i18n/config'
import {fetchAifansApi} from '../../../../lib/server-api'
import {redirectToUserSignIn,requireAuthenticatedPage} from '../../../../lib/auth/access-policy'
import {uuid} from '../../../../lib/chat-proxy'
export const instant=false
export default async function Page({params}:{params:Promise<{locale:string;profileId:string}>}){
 const {locale,profileId}=await params
 if(!isLocale(locale)||!uuid.test(profileId))notFound()
 const returnTo=`/${locale}/humans/${profileId}`,labels=humanProfileLabels(locale)
 const access=await requireAuthenticatedPage({locale,returnTo})
 const unavailable=<main><section role="alert"><p>{labels.error}</p><Link href={returnTo}>{labels.retry}</Link></section></main>
 if(access.status==='unavailable')return unavailable
 let response:Response
 try{response=await fetchAifansApi(`/v1/humans/${profileId}`,{policy:'live-no-store',getToken:async()=>access.token})}catch{return unavailable}
 if(response.status===401)redirectToUserSignIn({locale,returnTo})
 if(response.status===404)notFound()
 if(!response.ok)return unavailable
 const parsed=HumanProfileSchema.safeParse(await response.json().catch(()=>null))
 if(!parsed.success||parsed.data.identity.id!==profileId)return unavailable
 if(parsed.data.isOwner)redirect(`/${locale}/profile`)
 return <main><HumanProfilePanel key={`${profileId}:${access.viewerScope}`} initialProfile={parsed.data} locale={locale} socialLabels={await getMessages(locale)} viewerScope={access.viewerScope}/></main>
}
