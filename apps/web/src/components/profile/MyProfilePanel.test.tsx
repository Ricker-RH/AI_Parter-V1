import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {StrictMode} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {MyProfilePanel} from './MyProfilePanel.js'
vi.mock('./MyProfileTabs.js', () => ({MyProfileTabs: () => <div aria-label="Profile sections" role="tablist"><button role="tab">My IPs</button><button role="tab">Liked</button><button role="tab">Saved</button><button role="tab">Following</button></div>}))
vi.mock('../GlobalMoreMenu.js', () => ({GlobalMoreMenu: ({labels}: {labels: {more: string}}) => <button aria-label={labels.more} type="button">{labels.more}</button>}))

const labels = {
  loading: 'Loading profile…', authRequired: 'Sign in required', signIn: 'Sign in',
  unavailable: 'Unable to load your profile', retry: 'Try again', emptyBio: 'Add a bio to tell people about you.',
  edit: 'Edit profile', save: 'Save changes', saving: 'Saving…', cancel: 'Cancel',
  displayName: 'Name', username: 'Username', bio: 'Bio', locale: 'Language',
  languageEnglish: 'English', languageChinese: '简体中文', saved: 'Profile saved.',
  saveError: 'Profile could not be saved.', invalidName: 'Enter a name.', invalidUsername: 'Use 3–30 lowercase letters, numbers, or underscores.',
  back:'Back',search:'Search',more:'More',tabs:'Profile sections',myIps:'My IPs',liked:'Liked',savedTab:'Saved',following:'Following',loadingSection:'Loading section…',unavailableSection:'Unable to load this section.',retrySection:'Try again',myIpsEmpty:'No IPs yet',likedEmpty:'No liked posts yet',savedEmpty:'No saved posts yet',followingEmpty:'Not following anyone yet',
}
const account = {id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30', kind: 'human', username: 'rui', displayName: 'Rui', bio: null, preferredLocale: 'en', creatorModeEnabled: false}
const moduleUrl = import.meta.url
const stylesheet = readFileSync(fileURLToPath(new URL('./MyProfilePanel.module.css', moduleUrl)), 'utf8')
const globalStylesheet = readFileSync(fileURLToPath(new URL('../../app/globals.css', moduleUrl)), 'utf8')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return {promise, resolve}
}

afterEach(() => vi.unstubAllGlobals())

describe('MyProfilePanel', () => {
  it('renders the authenticated profile and saves edited fields', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json({...account, displayName: 'Rui Updated', bio: 'Hello'}))
    vi.stubGlobal('fetch', request)
    render(<MyProfilePanel labels={labels} locale="en" />)
    expect(await screen.findByRole('heading',{level:1,name:'@rui'})).toBeVisible()
    expect(screen.getByRole('heading',{level:1,name:'@rui'})).toBeVisible()
    expect(screen.getByRole('link',{name:'Back'})).toHaveAttribute('href','/en')
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Rui Updated'}})
    fireEvent.change(screen.getByLabelText('Bio'), {target: {value: 'Hello'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save changes'}))
    await waitFor(() => expect(screen.getByText('Profile saved.')).toBeVisible())
    expect(screen.queryByRole('dialog', {name: 'Edit profile'})).toBeNull()
    expect(screen.getByRole('heading', {level: 2, name: 'Rui Updated'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Edit profile'})).toHaveFocus()
    expect(request).toHaveBeenLastCalledWith('/api/me', expect.objectContaining({method: 'PATCH'}))
  })

  it('keeps the edit modal open and reports save failures', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(new Response(null, {status: 503}))
    vi.stubGlobal('fetch', request)
    render(<MyProfilePanel labels={labels} locale="en" />)
    await screen.findByRole('heading', {level: 2, name: 'Rui'})
    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    fireEvent.click(screen.getByRole('button', {name: 'Save changes'}))
    expect(await screen.findByRole('status')).toHaveTextContent('Profile could not be saved.')
    expect(screen.getByRole('dialog', {name: 'Edit profile'})).toBeVisible()
  })

  it('keeps the self profile free of the contextual language row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({...account, preferredLocale: 'zh-CN'})))
    const {container} = render(<MyProfilePanel labels={labels} locale="zh-CN" />)

    await screen.findByRole('heading', {level: 2, name: 'Rui'})
    expect(container.querySelector('.details dl')).toBeNull()
    expect(screen.queryByText('Language')).toBeNull()
    expect(screen.queryByText('简体中文')).toBeNull()
  })

  it('opens editing in an accessible modal, traps focus, and restores focus on dismissal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(account)))
    render(<MyProfilePanel labels={labels} locale="en" />)
    await screen.findByRole('heading', {level: 2, name: 'Rui'})

    const trigger = screen.getByRole('button', {name: 'Edit profile'})
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', {name: 'Edit profile'})
    const first = within(dialog).getByLabelText('Name')
    const close = within(dialog).getByRole('button', {name: 'Cancel Edit profile'})
    const buttons = within(dialog).getAllByRole('button')
    const last = buttons.at(-1)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(first).toHaveFocus()
    close.focus()
    fireEvent.keyDown(dialog, {key: 'Tab', shiftKey: true})
    expect(last).toHaveFocus()
    last?.focus()
    fireEvent.keyDown(dialog, {key: 'Tab'})
    expect(close).toHaveFocus()
    first.focus()
    fireEvent.focusIn(document.body)
    expect(first).toHaveFocus()

    fireEvent.keyDown(document, {key: 'Escape'})
    expect(screen.queryByRole('dialog', {name: 'Edit profile'})).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('closes the edit modal from its backdrop without changing the profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(account)))
    const {container} = render(<MyProfilePanel labels={labels} locale="en" />)
    await screen.findByRole('heading', {level: 2, name: 'Rui'})
    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    const backdrop = container.querySelector('[data-my-profile-edit-backdrop]')
    expect(backdrop).not.toBeNull()
    fireEvent.pointerDown(backdrop!)
    expect(screen.queryByRole('dialog', {name: 'Edit profile'})).toBeNull()
    expect(screen.getByRole('heading', {level: 2, name: 'Rui'})).toBeVisible()
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
    await screen.findByRole('heading',{level:1,name:'@rui'})
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
    await screen.findByRole('heading',{level:1,name:'@rui'})
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
    const identity = container.querySelector('section header')
    expect(identity?.children[0]).toHaveTextContent('@rui')
    expect(identity?.children[1]).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', {name: 'Edit profile'}).className).toContain('editAction')
    expect(stylesheet).toMatch(/\.identityRow\s*\{[^}]*justify-content:\s*space-between/s)
    expect(stylesheet).toMatch(/\.editAction\s*\{[^}]*min-height:\s*44px[^}]*width:\s*100%/s)
    expect(stylesheet).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('uses an edge-to-edge mobile surface and a bordered desktop surface', () => {
    expect(stylesheet).toMatch(/\.profile\s*\{[^}]*max-width:\s*640px/s)
    expect(stylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*\.surface\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*border:\s*1px solid var\(--shell-border\)[^}]*border-radius:\s*16px/s)
    expect(stylesheet).toMatch(/@media \(max-width:\s*699px\)[\s\S]*\.surface\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0/s)
    expect(stylesheet).toMatch(/@media \(max-width:\s*699px\)[\s\S]*\.page\s*>\s*div:first-child\s*>\s*header:first-child\s*\{[^}]*display:\s*none/s)
    expect(stylesheet).toMatch(/\.editDialog\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*border:\s*1px solid var\(--shell-border\)/s)
    expect(stylesheet).toMatch(/@media \(max-width:\s*699px\)[\s\S]*\.editDialog\s*\{[^}]*border-radius:\s*0[^}]*min-height:\s*100dvh/s)
  })

  it('keeps the header and scroll surface in a bounded two-row content grid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(account)))
    const {container} = render(<MyProfilePanel labels={labels} locale="en" />)

    await screen.findByRole('heading', {level: 2, name: 'Rui'})
    const page = container.firstElementChild
    const content = page?.firstElementChild
    const header = screen.getByRole('heading', {level: 1, name: '@rui'}).closest('header')
    const frame = container.querySelector('[data-profile-content-frame]')
    expect(content?.className).toContain('pageContent')
    expect(content?.children).toHaveLength(2)
    expect(frame).toBe(content?.children[1])
    expect(content?.children[0]).toBe(header)
    expect(frame).not.toContainElement(header)
    expect(content).not.toHaveAttribute('aria-hidden')
    expect(stylesheet).toMatch(/\.pageContent\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s)
    expect(stylesheet).toMatch(/\.surface\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*none/s)
    expect(stylesheet).toMatch(/\.page\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s)
    expect(stylesheet).not.toMatch(/\.page\s*\{[^}]*height:\s*calc\([^}]*100dvh/s)
    expect(globalStylesheet).toMatch(/--content-scroll-end-space:\s*16px/)
    expect(globalStylesheet).toMatch(/\[data-profile-content-frame\]\s*\{[^}]*scroll-padding-bottom:\s*var\(--content-scroll-end-space\)/)
    expect(globalStylesheet).toMatch(/\[data-profile-content-frame\]::after\s*\{[^}]*content:\s*""[^}]*display:\s*block[^}]*height:\s*var\(--content-scroll-end-space\)/)
    expect(globalStylesheet).toMatch(/@media \(min-width:\s*700px\)\s*\{[\s\S]*?\.shell\[data-shell="public"\] \.content > main\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/)

    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    expect(content).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the newest StrictMode profile load when an aborted older request resolves late', async () => {
    const older = deferred<Response>()
    const newer = deferred<Response>()
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      return signals.length === 1 ? older.promise : newer.promise
    }))

    render(<StrictMode><MyProfilePanel labels={labels} locale="en" /></StrictMode>)
    await waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[0]?.aborted).toBe(true)
    await act(async () => { newer.resolve(Response.json({...account, displayName: 'Newest profile'})) })
    expect(await screen.findByRole('heading', {level: 2, name: 'Newest profile'})).toBeVisible()

    await act(async () => { older.resolve(new Response(null, {status: 401})) })
    expect(screen.getByRole('heading', {level: 2, name: 'Newest profile'})).toBeVisible()
    expect(screen.queryByText('Sign in required')).toBeNull()
  })

  it('aborts an active profile load when the panel unmounts', async () => {
    const pending = deferred<Response>()
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return pending.promise
    }))

    const view = render(<MyProfilePanel labels={labels} locale="en" />)
    await waitFor(() => expect(signal).toBeDefined())
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { pending.resolve(Response.json(account)) })
  })

  it('aborts an active save and ignores its late completion after unmount', async () => {
    const pendingSave = deferred<Response>()
    let saveSignal: AbortSignal | undefined
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(account))
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        saveSignal = init?.signal ?? undefined
        return pendingSave.promise
      })
    vi.stubGlobal('fetch', request)
    const view = render(<MyProfilePanel labels={labels} locale="en" />)
    await screen.findByRole('heading',{level:1,name:'@rui'})
    fireEvent.click(screen.getByRole('button', {name: 'Edit profile'}))
    fireEvent.click(screen.getByRole('button', {name: 'Save changes'}))
    await waitFor(() => expect(saveSignal).toBeDefined())

    view.unmount()
    expect(saveSignal?.aborted).toBe(true)
    await act(async () => { pendingSave.resolve(Response.json({...account, displayName: 'Late save'})) })
  })
})
