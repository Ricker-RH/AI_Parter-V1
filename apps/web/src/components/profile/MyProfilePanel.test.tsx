import {act, cleanup, render, screen} from '@testing-library/react'
import type {Account} from '@aifans/contracts'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {StrictMode} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {CurrentAccountProvider, publishAccountUpdate} from '../account/CurrentAccountProvider.js'
import {PROFILE_BACKGROUND_COLORS} from './ProfileEditor.js'
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
const account: Account = {id: '5b8ba43c-0a9e-43ec-87be-448a9e1ebf30', kind: 'human', username: 'rui', displayName: 'Rui', bio: null, avatarUrl: null, preferredLocale: 'en', creatorModeEnabled: false, profileVersion: 7, background: {type: 'color', colorKey: 'paper'}}
const moduleUrl = import.meta.url
const stylesheet = readFileSync(fileURLToPath(new URL('./MyProfilePanel.module.css', moduleUrl)), 'utf8')
const globalStylesheet = readFileSync(fileURLToPath(new URL('../../app/globals.css', moduleUrl)), 'utf8')

function profile(initialAccount?: Account, locale: 'en' | 'zh-CN' = 'en') {
  return render(<CurrentAccountProvider {...(initialAccount ? {initialAccount} : {})}><MyProfilePanel labels={labels} locale={locale}/></CurrentAccountProvider>)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MyProfilePanel', () => {
  it('renders a saved color background before the identity from the shared token map', () => {
    const {container} = profile({...account, background: {type: 'color', colorKey: 'sage'}})
    const background = container.querySelector<HTMLElement>('[data-profile-background]')
    const identity = screen.getByRole('heading', {level: 2, name: 'Rui'})

    expect(background).toHaveAttribute('data-background-type', 'color')
    expect(background).toHaveStyle({'--profile-background-color': PROFILE_BACKGROUND_COLORS.sage})
    expect(background!.compareDocumentPosition(identity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders a saved image background with cover and focal-point custom properties', () => {
    const {container} = profile({...account, background: {type: 'image', url: 'https://media.example/rui-cover.webp', focalX: 0.23, focalY: 0.76}})
    const background = container.querySelector<HTMLElement>('[data-profile-background]')

    expect(background).toHaveAttribute('data-background-type', 'image')
    expect(background).toHaveStyle({
      '--profile-background-image': 'url("https://media.example/rui-cover.webp")',
      '--profile-background-focal-x': '23%',
      '--profile-background-focal-y': '76%',
    })
    expect(stylesheet).toMatch(/\.profileBackground\s*\{[^}]*background-size:\s*cover/s)
  })

  it('uses the shared Avatar for the saved image and fallback', () => {
    const view = profile({...account, avatarUrl: 'https://media.example/rui.webp'})
    expect(screen.getByRole('img', {name: 'Rui'})).toHaveAttribute('src', 'https://media.example/rui.webp')

    view.unmount()
    profile({...account, displayName: '👩🏽‍💻 Rui'})
    expect(screen.getByRole('img', {name: '👩🏽‍💻 Rui'})).toHaveTextContent('👩🏽‍💻')
  })

  it('links to the standalone editor with the encoded current profile return URL and has no inline editor', () => {
    profile(account, 'zh-CN')

    expect(screen.getByRole('link', {name: 'Edit profile'})).toHaveAttribute('href', '/zh-CN/profile/edit?returnTo=%2Fzh-CN%2Fprofile')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('form')).toBeNull()
    expect(screen.queryByRole('button', {name: 'Edit profile'})).toBeNull()
  })

  it('updates an already-open profile immediately when the provider publishes a saved account', () => {
    const {container} = profile(account)

    act(() => publishAccountUpdate({...account, displayName: 'Rui Updated', avatarUrl: 'https://media.example/rui-new.webp', background: {type: 'color', colorKey: 'lilac'}, profileVersion: 8}))

    expect(screen.getByRole('heading', {level: 2, name: 'Rui Updated'})).toBeVisible()
    expect(screen.getByRole('img', {name: 'Rui Updated'})).toHaveAttribute('src', 'https://media.example/rui-new.webp')
    expect(container.querySelector('[data-profile-background]')).toHaveStyle({'--profile-background-color': PROFILE_BACKGROUND_COLORS.lilac})
  })

  it('keeps loading, auth, unavailable, and retry states honest', async () => {
    let resolve!: (response: Response) => void
    const request = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((next) => { resolve = next }))
      .mockResolvedValueOnce(new Response(null, {status: 503}))
      .mockResolvedValueOnce(Response.json(account))
    vi.stubGlobal('fetch', request)
    const view = profile()
    expect(screen.getByRole('status')).toHaveTextContent('Loading profile…')

    await act(async () => resolve(new Response(null, {status: 401})))
    expect(await screen.findByText('Sign in required')).toBeVisible()
    expect(screen.getByRole('link', {name: 'Sign in'})).toHaveAttribute('href', '/en/auth/sign-in')

    view.unmount()
    profile()
    expect(await screen.findByText('Unable to load your profile')).toBeVisible()
    screen.getByRole('button', {name: 'Try again'}).click()
    expect(await screen.findByRole('heading', {level: 2, name: 'Rui'})).toBeVisible()
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('loads the shared account once under StrictMode', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(account))
    vi.stubGlobal('fetch', request)
    render(<StrictMode><CurrentAccountProvider><MyProfilePanel labels={labels} locale="en"/></CurrentAccountProvider></StrictMode>)

    expect(await screen.findByRole('heading', {level: 2, name: 'Rui'})).toBeVisible()
    expect(request).toHaveBeenCalledOnce()
  })

  it('uses one non-collapsing layout gap owner for exact mobile and desktop tab rhythm', () => {
    expect(stylesheet).toMatch(/\.profileBody\s*\{[^}]*display:\s*grid[^}]*gap:\s*16px/s)
    expect(stylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*\.profileBody\s*\{[^}]*gap:\s*24px/s)
    expect(stylesheet).toMatch(/\.profile\s*\{[^}]*padding-bottom:\s*0/s)
    expect(stylesheet).not.toMatch(/\.tabsSection\s*\{[^}]*(?:margin-top|padding-top):/s)
    expect(stylesheet).not.toMatch(/\.editAction\s*\{[^}]*margin-bottom:/s)
  })

  it('reserves a responsive hero height and keeps the bounded scroll and fixed-nav buffer', () => {
    expect(stylesheet).toMatch(/\.profileBackground\s*\{[^}]*height:\s*144px/s)
    expect(stylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*\.profileBackground\s*\{[^}]*height:\s*192px/s)
    expect(stylesheet).toMatch(/\.pageContent\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s)
    expect(stylesheet).toMatch(/\.surface\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s)
    expect(globalStylesheet).toMatch(/\[data-profile-content-frame\]::after\s*\{[^}]*height:\s*var\(--content-scroll-end-space\)/s)
  })
})
