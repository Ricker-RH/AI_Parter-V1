import {render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {PostDetail} from '@aifans/contracts'

const {fetchCurrentAccountResult, fetchPost, getOptionalPageAccess, redirectToUserSignIn} = vi.hoisted(() => ({fetchCurrentAccountResult: vi.fn(), fetchPost: vi.fn(), getOptionalPageAccess: vi.fn(), redirectToUserSignIn: vi.fn()}))
vi.mock('../../../../lib/social-api.js', () => ({fetchPost}))
vi.mock('../../../../lib/auth/access-policy.js', () => ({getOptionalPageAccess, redirectToUserSignIn}))
vi.mock('../../../../lib/current-account.js', () => ({fetchCurrentAccountResult}))
vi.mock('next/navigation', () => ({notFound: vi.fn(), useRouter: () => ({back: vi.fn(), push: vi.fn(), refresh: vi.fn()})}))

import PostPage from './page.js'

const postId = '22222222-2222-4222-8222-222222222222'
const detail: PostDetail = {
  id: postId, body: 'A real post', languageCode: 'en', publishedAt: '2026-08-31T12:00:00.000Z', likeCount: 0, commentCount: 0, bookmarkCount: 0, shareCount: 0,
  author: {kind: 'ip', id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en'], visualType: 'anime'},
  comments: {groups: [], nextCursor: null},
}

describe('post detail route', () => {
  beforeEach(() => { fetchPost.mockReset().mockResolvedValue({status: 'ok', data: detail}); fetchCurrentAccountResult.mockReset().mockResolvedValue({status: 'anonymous'}); getOptionalPageAccess.mockReset().mockResolvedValue({status: 'anonymous'}); redirectToUserSignIn.mockReset() })
  afterEach(() => vi.unstubAllGlobals())

  it('passes a minimal strict current viewer DTO from the authenticated server account', async () => {
    getOptionalPageAccess.mockResolvedValue({status: 'authenticated', token: 'token', viewerScope: 'viewer-a'})
    fetchCurrentAccountResult.mockResolvedValue({status: 'authenticated', account: {id: '44444444-4444-4444-8444-444444444444', kind: 'human', username: 'rui', displayName: 'Rui', avatarUrl: 'https://media.example/rui.webp', preferredLocale: 'en', creatorModeEnabled: false}})

    render(await PostPage({params: Promise.resolve({locale: 'en', postId}), searchParams: Promise.resolve({})}))

    expect(fetchCurrentAccountResult).toHaveBeenCalledWith({token: 'token'})
    expect(screen.getByRole('img', {name: 'Rui'})).toHaveAttribute('src', 'https://media.example/rui.webp')
  })

  it.each(['anonymous', 'auth-required', 'unavailable'] as const)('keeps mutations gated while the client resolves an authenticated access with a %s account result', async (accountStatus) => {
    const request = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', request)
    getOptionalPageAccess.mockResolvedValue({status: 'authenticated', token: 'token', viewerScope: 'viewer-a'})
    fetchCurrentAccountResult.mockResolvedValue({status: accountStatus})

    render(await PostPage({params: Promise.resolve({locale: 'en', postId}), searchParams: Promise.resolve({})}))

    expect(screen.getByRole('status', {name: 'Comments'})).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('textbox', {name: 'Write a comment'})).toBeNull()
    expect(request).toHaveBeenCalledWith('/api/me', expect.objectContaining({cache: 'no-store', credentials: 'include'}))
  })

  it('keeps a valid comment cursor through fetch and guest sign-in return paths', async () => {
    render(await PostPage({params: Promise.resolve({locale: 'zh-CN', postId}), searchParams: Promise.resolve({commentCursor: 'comments_next-1'})}))
    expect(fetchPost).toHaveBeenCalledWith(postId, {commentCursor: 'comments_next-1'})
    expect(screen.getByRole('link', {name: '登录后参与讨论'})).toHaveAttribute('href', `/zh-CN/auth/sign-in?next=${encodeURIComponent(`/zh-CN/posts/${postId}?commentCursor=comments_next-1`)}`)
    expect(screen.getByRole('heading', {name: '动态'})).toBeVisible()
    expect(document.querySelector('[data-social-surface-viewport]')).toHaveAttribute('data-social-surface-viewport-layout', 'docked')
    expect(document.querySelector('[data-social-surface-viewport]')).not.toHaveAttribute('role')
    expect(screen.getByRole('region', {name: '评论'})).toHaveClass('post-detail-scroll-region')
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
