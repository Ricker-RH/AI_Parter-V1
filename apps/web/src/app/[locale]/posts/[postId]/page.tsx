import {notFound} from 'next/navigation'
import {PostDetailContent} from '../../../../components/social/PostDetailContent'
import {getMessages, isLocale} from '../../../../i18n/config'
import {fetchPost} from '../../../../lib/social-api'
import {requestCookie} from '../../../../lib/request-cookie'
import {fetchCurrentAccountResult} from '../../../../lib/current-account'

export default async function PostPage({params, searchParams}: {params: Promise<{locale: string; postId: string}>; searchParams: Promise<{commentCursor?: string}>}) {
  const {locale, postId} = await params
  if (!isLocale(locale)) notFound()
  const {commentCursor} = await searchParams
  const [messages, cookie] = await Promise.all([getMessages(locale), requestCookie()])
  const [result,account] = await Promise.all([fetchPost(postId, {cookie, commentCursor}),fetchCurrentAccountResult({cookie})])
  const nextCursor = result.status === 'ok' ? result.data.comments.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/posts/${postId}?${new URLSearchParams({commentCursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.post}</h1></header><PostDetailContent authenticated={account.status==='authenticated'} labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
}
