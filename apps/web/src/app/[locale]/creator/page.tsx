import {notFound} from 'next/navigation'
import {connection} from 'next/server'
import {CreatorCenter} from '../../../components/creator/CreatorCenter'
import {CreatorHero} from '../../../components/creator/CreatorHero'
import {getMessages,isLocale} from '../../../i18n/config'
import {isCreatorModeEnabled} from '../../../lib/creator-mode'
import {requireAuthenticatedPage} from '../../../lib/auth/access-policy'
import {creatorHref,readCreatorReturnTo} from '../../../lib/auth/return-to'
export const instant = false
export default async function CreatorPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams?:Promise<{returnTo?:string|string[]}>}){await connection();const queryPromise:Promise<{returnTo?:string|string[]}>=searchParams??Promise.resolve({});const [{locale},query]=await Promise.all([params,queryPromise]);if(!isCreatorModeEnabled()||!isLocale(locale))notFound();const messages=await getMessages(locale);const returnTo=readCreatorReturnTo(locale,query.returnTo);const creatorReturnTo=returnTo?creatorHref(locale,returnTo):`/${locale}/creator`;const access=await requireAuthenticatedPage({locale,returnTo:creatorReturnTo});if(access.status==='unavailable')return <main className="creator-page"><CreatorHero labels={messages.creator} locale={locale} {...(returnTo?{returnTo}:{})}/><p className="creator-notice" role="alert">{messages.creator.unavailable}</p></main>;return <CreatorCenter labels={messages.creator} locale={locale} {...(returnTo?{returnTo}:{})}/>}
