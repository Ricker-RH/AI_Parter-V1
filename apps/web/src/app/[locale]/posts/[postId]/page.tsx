import {notFound} from 'next/navigation'
import {PostDetailContent} from '../../../../components/social/PostDetailContent'
import {getMessages, isLocale} from '../../../../i18n/config'
import {fetchPost} from '../../../../lib/social-api'
import {getOptionalPageAccess, redirectToUserSignIn} from '../../../../lib/auth/access-policy'
import {PostDetailHeader} from '../../../../components/social/PostDetailHeader'

export default async function PostPage({params, searchParams}: {params: Promise<{locale: string; postId: string}>; searchParams: Promise<{commentCursor?: string}>}) {
  const {locale, postId} = await params
  if (!isLocale(locale)) notFound()
  const {commentCursor} = await searchParams
  const safeCommentCursor = typeof commentCursor === 'string' && /^[A-Za-z0-9_-]{1,2048}$/.test(commentCursor) ? commentCursor : undefined
  const returnTo = `/${locale}/posts/${postId}${safeCommentCursor ? `?${new URLSearchParams({commentCursor: safeCommentCursor})}` : ''}`
  const messages = await getMessages(locale)
  const access = await getOptionalPageAccess()
  const result = await fetchPost(postId, {commentCursor: safeCommentCursor, ...(access.status === 'authenticated' ? {token: access.token} : {})})
  if (result.status === 'auth-required' && access.status === 'authenticated') redirectToUserSignIn({locale, returnTo})
  const nextCursor = result.status === 'ok' ? result.data.comments.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/posts/${postId}?${new URLSearchParams({commentCursor: nextCursor})}` : undefined
  return <main className="post-detail-page"><PostDetailHeader labels={messages} locale={locale} postId={postId}/><PostDetailContent authenticated={access.status==='authenticated'} labels={messages} locale={locale} moreHref={moreHref} referenceTime={Date.now()} result={result} returnTo={returnTo} /></main>
}
