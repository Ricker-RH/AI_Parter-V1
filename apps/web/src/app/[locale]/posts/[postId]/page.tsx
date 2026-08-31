import {notFound} from 'next/navigation'
import {PostDetailContent} from '../../../../components/social/PostDetailContent'
import {getMessages, isLocale} from '../../../../i18n/config'
import {fetchPost, publicSocialApiUrl} from '../../../../lib/social-api'
import {requestCookie} from '../../../../lib/request-cookie'

export default async function PostPage({params}: {params: Promise<{locale: string; postId: string}>}) {
  const {locale, postId} = await params
  if (!isLocale(locale)) notFound()
  const [messages, result] = await Promise.all([getMessages(locale), requestCookie().then((cookie) => fetchPost(postId, cookie))])
  return <main><header className="page-header"><h1 className="page-title">{messages.post}</h1></header><PostDetailContent apiBaseUrl={publicSocialApiUrl()} labels={messages} locale={locale} result={result} /></main>
}
