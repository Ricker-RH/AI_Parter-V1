import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {PostDetail} from '@aifans/contracts'

const {fetchPost, getOptionalPageAccess, redirectToUserSignIn} = vi.hoisted(() => ({fetchPost: vi.fn(), getOptionalPageAccess: vi.fn(), redirectToUserSignIn: vi.fn()}))
vi.mock('../../../../lib/social-api.js', () => ({fetchPost}))
vi.mock('../../../../lib/auth/access-policy.js', () => ({getOptionalPageAccess, redirectToUserSignIn}))
vi.mock('next/navigation', () => ({notFound: vi.fn(), useRouter: () => ({back: vi.fn(), push: vi.fn(), refresh: vi.fn()})}))

import PostPage from './page.js'

const postId = '22222222-2222-4222-8222-222222222222'
const detail: PostDetail = {
  id: postId, body: 'A real post', languageCode: 'en', publishedAt: '2026-08-31T12:00:00.000Z', likeCount: 0, commentCount: 0,
  author: {kind: 'ip', id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en'], visualType: 'anime'},
  comments: {items: [], nextCursor: null},
}

describe('post detail route', () => {
  beforeEach(() => { fetchPost.mockReset().mockResolvedValue({status: 'ok', data: detail}); getOptionalPageAccess.mockReset().mockResolvedValue({status: 'anonymous'}); redirectToUserSignIn.mockReset() })

  it('keeps a valid comment cursor through fetch and guest sign-in return paths', async () => {
    render(await PostPage({params: Promise.resolve({locale: 'zh-CN', postId}), searchParams: Promise.resolve({commentCursor: 'comments_next-1'})}))
    expect(fetchPost).toHaveBeenCalledWith(postId, {commentCursor: 'comments_next-1'})
    expect(screen.getByRole('link', {name: '登录后参与讨论'})).toHaveAttribute('href', `/zh-CN/auth/sign-in?next=${encodeURIComponent(`/zh-CN/posts/${postId}?commentCursor=comments_next-1`)}`)
    expect(screen.getByRole('heading', {name: '动态'})).toBeVisible()
  })

  it('uses the short public-page session budget and lets the client resolve an inconclusive session', async () => {
    await PostPage({params: Promise.resolve({locale: 'en', postId}), searchParams: Promise.resolve({})})

    expect(getOptionalPageAccess).toHaveBeenCalledWith()
  })

  it('drops an unsafe comment cursor from the request and return path', async () => {
    render(await PostPage({params: Promise.resolve({locale: 'en', postId}), searchParams: Promise.resolve({commentCursor: 'not.a.cursor'})}))
    expect(fetchPost).toHaveBeenCalledWith(postId, {commentCursor: undefined})
    expect(screen.getByRole('link', {name: 'Sign in to join the conversation'})).toHaveAttribute('href', `/en/auth/sign-in?next=${encodeURIComponent(`/en/posts/${postId}`)}`)
  })
})
