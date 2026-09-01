import {notFound} from 'next/navigation'
import {PostDetailContent} from '../../../../components/social/PostDetailContent'
import {getMessages, isLocale} from '../../../../i18n/config'
import {fetchPost} from '../../../../lib/social-api'
import {getOptionalPageAccess, redirectToUserSignIn} from '../../../../lib/auth/access-policy'

export default async function PostPage({params, searchParams}: {params: Promise<{locale: string; postId: string}>; searchParams: Promise<{commentCursor?: string}>}) {
  const {locale, postId} = await params
  if (!isLocale(locale)) notFound()
  const {commentCursor} = await searchParams
  const returnTo = `/${locale}/posts/${postId}${commentCursor ? `?${new URLSearchParams({commentCursor})}` : ''}`
  const messages = await getMessages(locale)
  const access = await getOptionalPageAccess()
  const result = await fetchPost(postId, {commentCursor, ...(access.status === 'authenticated' ? {token: access.token} : {})})
  if (result.status === 'auth-required' && access.status === 'authenticated') redirectToUserSignIn({locale, returnTo})
  const nextCursor = result.status === 'ok' ? result.data.comments.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/posts/${postId}?${new URLSearchParams({commentCursor: nextCursor})}` : undefined
  return <main><header className="page-header"><h1 className="page-title">{messages.post}</h1></header><PostDetailContent authenticated={access.status==='authenticated'} labels={messages} locale={locale} moreHref={moreHref} result={result} /></main>
}
