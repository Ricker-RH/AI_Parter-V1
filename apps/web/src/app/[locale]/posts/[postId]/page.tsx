import {notFound} from 'next/navigation'
import {PostDetailContent} from '../../../../components/social/PostDetailContent'
import {getMessages, isLocale} from '../../../../i18n/config'
import {fetchPost} from '../../../../lib/social-api'
import {getOptionalPageAccess, redirectToUserSignIn} from '../../../../lib/auth/access-policy'
import {PostDetailHeader} from '../../../../components/social/PostDetailHeader'
import {SocialSurface} from '../../../../components/social/SocialSurface'
import {fetchCurrentAccountResult} from '../../../../lib/current-account'

export const instant = false

export default async function PostPage({params, searchParams}: {params: Promise<{locale: string; postId: string}>; searchParams: Promise<{commentCursor?: string}>}) {
  const {locale, postId} = await params
  if (!isLocale(locale)) notFound()
  const {commentCursor} = await searchParams
  const safeCommentCursor = typeof commentCursor === 'string' && /^[A-Za-z0-9_-]{1,2048}$/.test(commentCursor) ? commentCursor : undefined
  const returnTo = `/${locale}/posts/${postId}${safeCommentCursor ? `?${new URLSearchParams({commentCursor: safeCommentCursor})}` : ''}`
  const messages = await getMessages(locale)
  const access = await getOptionalPageAccess()
  const [result, accountResult] = await Promise.all([
    fetchPost(postId, {commentCursor: safeCommentCursor, ...(access.status === 'authenticated' ? {token: access.token} : {})}),
    access.status === 'authenticated' ? fetchCurrentAccountResult({token: access.token}) : Promise.resolve(null),
  ])
  if (result.status === 'auth-required' && access.status === 'authenticated') redirectToUserSignIn({locale, returnTo})
  const nextCursor = result.status === 'ok' ? result.data.comments.nextCursor : null
  const moreHref = nextCursor ? `/${locale}/posts/${postId}?${new URLSearchParams({commentCursor: nextCursor})}` : undefined
  const viewer = accountResult?.status === 'authenticated' ? {displayName: accountResult.account.displayName, avatarUrl: accountResult.account.avatarUrl ?? null} : undefined
  const accountResolutionNeeded = access.status === 'authenticated' && accountResult?.status !== 'authenticated'
  return <SocialSurface className="post-detail-page" header={<PostDetailHeader labels={messages} locale={locale} postId={postId}/>} label={messages.posts} viewportLayout="docked"><PostDetailContent accountResolutionNeeded={accountResolutionNeeded} authenticated={access.status==='authenticated'} authResolutionNeeded={access.status==='unavailable'} labels={messages} locale={locale} moreHref={moreHref} referenceTime={Date.now()} result={result} returnTo={returnTo} {...(viewer ? {viewer} : {})} {...(access.status === 'authenticated' ? {viewerScope: access.viewerScope} : {})} /></SocialSurface>
}
