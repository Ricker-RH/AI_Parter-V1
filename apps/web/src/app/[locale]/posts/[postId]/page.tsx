import {notFound} from 'next/navigation'
import {PostDetailContent} from '../../../../components/social/PostDetailContent'
import {getMessages, isLocale} from '../../../../i18n/config'
import {fetchPost} from '../../../../lib/social-api'
import {requestCookie} from '../../../../lib/request-cookie'

export default async function PostPage({params, searchParams}: {params: Promise<{locale: string; postId: string}>; searchParams: Promise<{commentCursor?: string}>}) {
  const {locale, postId} = await params
  if (!isLocale(locale)) notFound()
  const {commentCursor} = await searchParams
  const [messages, cookie] = await Promise.all([getMessages(locale), requestCookie()])
  const result = await fetchPost(postId, {cookie, commentCursor})
  const nextCursor = result.status === 'ok' ? result.data.comments.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/posts/${postId}?${new URLSearchParams({commentCursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.post}</h1></header><PostDetailContent labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
}
