import {CreatorDraftSchema} from '@aifans/contracts'
import type {ReactNode} from 'react'
import {notFound} from 'next/navigation'
import {connection} from 'next/server'
import {CreatorDraftForm} from '../../../../components/creator/CreatorDraftForm'
import {CreatorHeader} from '../../../../components/creator/CreatorHeader'
import styles from '../../../../components/creator/CreatorPortal.module.css'
import type {Locale} from '../../../../i18n/config'
import {getMessages,isLocale} from '../../../../i18n/config'
import {fetchAifansApi} from '../../../../lib/server-api'
import {isCreatorModeEnabled} from '../../../../lib/creator-mode'
import {redirectToUserSignIn, requireAuthenticatedPage} from '../../../../lib/auth/access-policy'

export const instant = false

function DraftSurface({locale,children}:{locale:Locale;children:ReactNode}) {
  return <main className={styles.workspace}>
    <CreatorHeader locale={locale} title={locale==='zh-CN'?'角色草稿':'Character draft'} back={`/${locale}/creator/studio`}/>
    <div className={styles.frame}><div className={styles.scrollContent}>{children}</div></div>
  </main>
}

export default async function CreatorDraftPage({params}:{params:Promise<{locale:string;draftId:string}>}) {
  await connection()
  const {locale,draftId}=await params
  if(!isCreatorModeEnabled()||!isLocale(locale))notFound()
  const messages=await getMessages(locale)
  const returnTo=`/${locale}/creator/${draftId}`
  const unavailable=<DraftSurface locale={locale}><p className="creator-notice" role="alert">{messages.creator.unavailable}</p></DraftSurface>
  const access=await requireAuthenticatedPage({locale,returnTo})
  if(access.status==='unavailable')return unavailable
  let response
  try { response=await fetchAifansApi(`/v1/creator/drafts/${encodeURIComponent(draftId)}`,{policy:'private-cache',getToken:async()=>access.token}) }
  catch { return unavailable }
  if(response.status===401)redirectToUserSignIn({locale,returnTo})
  if(response.status===404)notFound()
  if(!response.ok)return unavailable
  try {
    const draft=CreatorDraftSchema.parse(await response.json())
    return <DraftSurface locale={locale}><CreatorDraftForm draft={draft} labels={messages.creator} locale={locale}/></DraftSurface>
  } catch { return unavailable }
}
