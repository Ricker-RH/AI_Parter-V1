import {fireEvent, render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'
import type {SocialLabels} from './types'
import {AuthorPreview} from './AuthorPreview.js'

vi.mock('next/link', () => ({default: ({children, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>}))
vi.mock('next/navigation', () => ({useRouter: () => ({replace: vi.fn()})}))

const author = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en' as const], visualType: 'anime' as const}
const labels = {close: 'Close', follow: 'Follow', followers: 'followers', followingAction: 'Following', interactionError: 'Action failed', profile: 'Profile', unavailableDescription: 'Unavailable'} as SocialLabels

describe('AuthorPreview viewer scope', () => {
  it('uses a keyed scoped child instead of aborting requests during render', () => {
    const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/AuthorPreview.tsx' : 'apps/web/src/components/social/AuthorPreview.tsx', 'utf8')
    expect(source).toContain('key={scope}')
    expect(source).not.toContain('synchronizedIdentity')
    expect(source).not.toContain('profileController.current?.abort()')
  })

  it('drops an A follow override before rendering the same author for viewer B', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)))
    const {rerender} = render(<AuthorPreview author={author} canMutate followsAuthor={false} labels={labels} locale="en" returnTo="/en" viewerScope="viewer-a"/>)
    fireEvent.click(screen.getByRole('button', {name: 'Profile: Luma'}))
    fireEvent.click(screen.getByRole('button', {name: 'Follow'}))
    expect(screen.getByRole('button', {name: 'Following'})).toBeVisible()

    rerender(<AuthorPreview author={author} canMutate followsAuthor={false} labels={labels} locale="en" returnTo="/en" viewerScope="viewer-b"/>)

    expect(screen.queryByRole('dialog', {name: 'Luma'})).toBeNull()
    fireEvent.click(screen.getByRole('button', {name: 'Profile: Luma'}))
    expect(screen.getByRole('button', {name: 'Follow'})).toBeVisible()
  })

  it('does not let an A profile response populate viewer B', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const {rerender} = render(<AuthorPreview author={author} canMutate={false} labels={labels} locale="en" returnTo="/en" viewerScope="viewer-a"/>)
    fireEvent.click(screen.getByRole('button', {name: 'Profile: Luma'}))
    rerender(<AuthorPreview author={author} canMutate={false} labels={labels} locale="en" returnTo="/en" viewerScope="viewer-b"/>)
    expect(screen.queryByRole('dialog', {name: 'Luma'})).toBeNull()

    resolve(Response.json({profile: author, followerCount: 99, posts: {items: [], nextCursor: null}}))
    await Promise.resolve()
    fireEvent.click(screen.getByRole('button', {name: 'Profile: Luma'}))
    expect(screen.queryByText('99 followers')).toBeNull()
  })
})
