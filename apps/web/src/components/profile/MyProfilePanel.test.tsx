import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {MyProfilePanel} from './MyProfilePanel.js'

const labels = {
  loading: 'Loading profile…', authRequired: 'Sign in required', signIn: 'Sign in',
  unavailable: 'Unable to load your profile', retry: 'Try again', emptyBio: 'Add a bio to tell people about you.',
  edit: 'Edit profile', save: 'Save changes', saving: 'Saving…', cancel: 'Cancel',
  displayName: 'Name', username: 'Username', bio: 'Bio', locale: 'Language',
  languageEnglish: 'English', languageChinese: '简体中文', saved: 'Profile saved.',
  saveError: 'Profile could not be saved.', invalidName: 'Enter a name.', invalidUsername: 'Use 3–30 lowercase letters, numbers, or underscores.',
}
const account = {id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30', kind: 'human', username: 'rui', displayName: 'Rui', bio: null, preferredLocale: 'en', creatorModeEnabled: false}
const moduleUrl = import.meta.url
const stylesheet = readFileSync(fileURLToPath(new URL('./MyProfilePanel.module.css', moduleUrl)), 'utf8')

afterEach(() => vi.unstubAllGlobals())

describe('MyProfilePanel', () => {
  it('renders the authenticated profile and saves edited fields', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json({...account, displayName: 'Rui Updated', bio: 'Hello'}))
    vi.stubGlobal('fetch', request)
    render(<MyProfilePanel labels={labels} locale="en" />)
    expect(await screen.findByText('@rui')).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Rui Updated'}})
    fireEvent.change(screen.getByLabelText('Bio'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save changes'}))
    await waitFor(() => expect(screen.getByText('Profile saved.')).toBeVisible())
    expect(request).toHaveBeenLastCalledWith('/api/me', expect.objectContaining({method: 'PATCH'}))
  })

  it('shows sign-in for 401 and an unavailable state for 503 or malformed data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 401})))
    render(<MyProfilePanel labels={labels} locale="en" />)
    expect(await screen.findByText('Sign in required')).toBeVisible()
    expect(stylesheet).toMatch(/\.state a\s*\{[^}]*min-height:\s*44px/s)
    cleanup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 503})))
    render(<MyProfilePanel labels={labels} locale="en" />)
    expect(await screen.findByText('Unable to load your profile')).toBeVisible()
    cleanup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({username: 'not valid'})))
    render(<MyProfilePanel labels={labels} locale="en" />)
    expect(await screen.findByText('Unable to load your profile')).toBeVisible()
  })

  it('validates edits, supports cancel, and does not show a human-post composer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(account)))
    render(<MyProfilePanel labels={labels} locale="en" />)
    await screen.findByText('@rui')
    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: '   '}})
    fireEvent.click(screen.getByRole('button', {name: 'Save changes'}))
    expect(screen.getByText('Enter a name.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}))
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', {name: /post|compose/i})).not.toBeInTheDocument()
  })

  it('disables the save action while a request is pending', async () => {
    let resolveSave: ((response: Response) => void) | undefined
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(account))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSave = resolve }))
    vi.stubGlobal('fetch', request)
    render(<MyProfilePanel labels={labels} locale="en" />)
    await screen.findByText('@rui')
    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    fireEvent.click(screen.getByRole('button', {name: 'Save changes'}))
    expect(screen.getByRole('button', {name: 'Saving…'})).toBeDisabled()
    expect(request).toHaveBeenCalledTimes(2)
    resolveSave?.(Response.json(account))
  })

  it('uses a Threads-like identity hierarchy with copy left, avatar right, and a full-width edit action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({...account, displayName: 'A very long profile display name that must wrap safely', bio: 'A long biography that should wrap instead of overflowing the profile surface.'})))
    const {container} = render(<MyProfilePanel labels={labels} locale="en" />)

    expect(await screen.findByRole('heading', {level: 2, name: 'A very long profile display name that must wrap safely'})).toBeVisible()
    const identity = container.querySelector('header')
    expect(identity?.children[0]).toContainElement(screen.getByText('@rui'))
    expect(identity?.children[1]).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', {name: 'Edit profile'}).className).toContain('editAction')
    expect(stylesheet).toMatch(/\.identityRow\s*\{[^}]*justify-content:\s*space-between/s)
    expect(stylesheet).toMatch(/\.editAction\s*\{[^}]*min-height:\s*44px[^}]*width:\s*100%/s)
    expect(stylesheet).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('uses an edge-to-edge mobile profile and a bounded desktop surface', () => {
    expect(stylesheet).toMatch(/\.profile\s*\{[^}]*max-width:\s*640px/s)
    expect(stylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*\.profile\s*\{[^}]*border:\s*1px solid var\(--shell-border\)[^}]*border-radius:\s*24px/s)
    expect(stylesheet).toMatch(/@media \(max-width:\s*699px\)[\s\S]*\.profile\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0/s)
  })
})
