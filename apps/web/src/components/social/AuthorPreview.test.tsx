import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'
import type {SocialLabels} from './types'
import {AuthorPreview} from './AuthorPreview.js'

vi.mock('next/link', () => ({default: ({children, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>}))
vi.mock('next/navigation', () => ({useRouter: () => ({replace: vi.fn()})}))

const author = {kind: 'ip' as const, id: '11111111-1111-4111-8111-111111111111', username: 'luma', displayName: 'Luma', languages: ['en' as const], visualType: 'anime' as const}
const labels = {close: 'Close', follow: 'Follow', followers: 'followers', followingAction: 'Following', interactionError: 'Action failed', profile: 'Profile', unavailableDescription: 'Unavailable'} as SocialLabels

function renderOpenPreview(props: Partial<React.ComponentProps<typeof AuthorPreview>> = {}) {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)))
  const result = render(<AuthorPreview author={author} canMutate={false} labels={labels} locale="en" returnTo="/en" {...props}/>)
  const trigger = screen.getByRole('button', {name: 'Profile: Luma'})
  fireEvent.click(trigger)
  return {...result, dialog: screen.getByRole('dialog', {name: 'Luma'}), trigger}
}

describe('AuthorPreview modal', () => {
  it('portals the dialog to a document-level backdrop without a close button', () => {
    const {container, dialog} = renderOpenPreview()
    const backdrop = dialog.parentElement

    expect(backdrop).toHaveAttribute('data-author-preview-backdrop')
    expect(container).not.toContainElement(dialog)
    expect(screen.queryByRole('button', {name: 'Close'})).toBeNull()
  })

  it('does not close when the dialog receives a mouse down', () => {
    const {dialog} = renderOpenPreview()

    fireEvent.mouseDown(dialog)

    expect(screen.getByRole('dialog', {name: 'Luma'})).toBeVisible()
  })

  it('closes from the backdrop and restores focus to the trigger', () => {
    const {dialog, trigger} = renderOpenPreview()
    const backdrop = dialog.parentElement
    expect(backdrop).not.toBeNull()

    fireEvent.mouseDown(backdrop!)

    expect(screen.queryByRole('dialog', {name: 'Luma'})).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger', () => {
    const {trigger} = renderOpenPreview()

    fireEvent.keyDown(document, {key: 'Escape'})

    expect(screen.queryByRole('dialog', {name: 'Luma'})).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('moves focus into the portal and traps forward and reverse tabbing', async () => {
    const {dialog} = renderOpenPreview()
    const first = screen.getByRole('link', {name: 'Luma'})
    const last = screen.getByRole('link', {name: 'Follow'})

    await waitFor(() => expect(first).toHaveFocus())
    last.focus()
    fireEvent.keyDown(document, {key: 'Tab'})
    expect(first).toHaveFocus()
    fireEvent.keyDown(document, {key: 'Tab', shiftKey: true})
    expect(last).toHaveFocus()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('keeps the existing follow transition and failure feedback', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => String(input).endsWith('/follow')
      ? Promise.resolve(new Response(null, {status: 500}))
      : new Promise<Response>(() => undefined)))
    render(<AuthorPreview author={author} canMutate followsAuthor={false} labels={labels} locale="en" returnTo="/en" viewerScope="viewer-a"/>)
    fireEvent.click(screen.getByRole('button', {name: 'Profile: Luma'}))

    fireEvent.click(screen.getByRole('button', {name: 'Follow'}))
    expect(screen.getByRole('button', {name: 'Following'})).toBeDisabled()

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Follow'})).toBeEnabled()
  })

  it('rolls back an optimistic follow when the pending modal is closed and reopened', async () => {
    let followSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/follow')) followSignal = init?.signal as AbortSignal
      return new Promise<Response>(() => undefined)
    }))
    render(<AuthorPreview author={author} canMutate followsAuthor={false} labels={labels} locale="en" returnTo="/en" viewerScope="viewer-a"/>)
    const trigger = screen.getByRole('button', {name: 'Profile: Luma'})
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', {name: 'Follow'}))
    expect(screen.getByRole('button', {name: 'Following'})).toBeDisabled()

    const dialog = screen.getByRole('dialog', {name: 'Luma'})
    fireEvent.mouseDown(dialog.parentElement!)

    await waitFor(() => expect(followSignal).toHaveProperty('aborted', true))
    fireEvent.click(trigger)
    expect(screen.getByRole('button', {name: 'Follow'})).toBeEnabled()
  })
})

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
