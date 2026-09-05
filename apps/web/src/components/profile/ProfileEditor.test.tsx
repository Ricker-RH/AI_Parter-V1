import {AccountSchema, type Account} from '@aifans/contracts'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {CurrentAccountProvider, publishAccountUpdate} from '../account/CurrentAccountProvider.js'
import {PROFILE_BACKGROUND_COLORS, ProfileEditor, clampFocalPoint, type ProfileEditorLabels} from './ProfileEditor.js'

const {replace} = vi.hoisted(() => ({replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({replace})}))
// Preferences have their own network/permission tests; isolate profile-asset request ordering here.
vi.mock('./HumanPreferencesEditor', () => ({HumanPreferencesEditor: () => <section aria-label="Privacy and presence"/>}))

const account = AccountSchema.parse({
  id: '11111111-1111-4111-8111-111111111111', kind: 'human', username: 'rui', displayName: 'Rui', bio: 'Hello',
  avatarUrl: 'https://media.example/avatar.webp', preferredLocale: 'en', creatorModeEnabled: false, profileVersion: 4,
  background: {type: 'color', colorKey: 'paper'},
})

const labels: ProfileEditorLabels = {
  title: 'Edit profile', back: 'Back', save: 'Save', saving: 'Saving…', cancel: 'Cancel', loading: 'Loading profile…',
  authUnavailable: 'Your profile is unavailable.', retry: 'Retry', displayName: 'Name', username: 'Username', bio: 'Bio',
  language: 'Language', languageEnglish: 'English', languageChinese: 'Simplified Chinese', avatar: 'Avatar', avatarUpload: 'Upload avatar',
  avatarRemove: 'Remove avatar', background: 'Background', backgroundUpload: 'Upload background', backgroundRemove: 'Use color instead',
  focalX: 'Horizontal focus', focalY: 'Vertical focus', uploading: 'Uploading…', uploadRetry: 'Retry upload', invalidType: 'Use JPEG, PNG, or WebP.',
  invalidSize: 'Image must be 10 MB or smaller.', invalidDimensions: 'Image dimensions must be between 64 and 12000 pixels.',
  uploadError: 'Upload failed.', saveError: 'Profile could not be saved.', conflict: 'This profile changed elsewhere.',
  refetch: 'Reload latest profile', invalidName: 'Enter a name.', invalidUsername: 'Use a valid username.', unsavedConfirm: 'Discard unsaved changes?',
  colorPaper: 'Paper', colorSand: 'Sand', colorMist: 'Mist', colorSage: 'Sage', colorSky: 'Sky', colorLilac: 'Lilac', colorGraphite: 'Graphite',
}

function renderEditor(initial: Account = account, returnTo = '/en/profile?tab=saved#row', expand = true) {
  const view = render(<CurrentAccountProvider initialAccount={initial}><ProfileEditor labels={labels} locale="en" returnTo={returnTo}/></CurrentAccountProvider>)
  if (expand) for (const name of ['Name', 'Username', 'Bio']) fireEvent.click(screen.getByRole('button', {name}))
  return view
}

function backgroundRadio(name: string) {
  if (!screen.queryByRole('radio', {name})) fireEvent.click(screen.getByRole('button', {name: 'Background'}))
  return screen.getByRole('radio', {name})
}

function imageFile({name = 'photo.webp', size = 1200, type = 'image/webp'} = {}) {
  return new File([new Uint8Array(size)], name, {type})
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return {promise, resolve}
}

function bitmap(width = 800, height = 600) {
  return {width, height, close: vi.fn()} as unknown as ImageBitmap
}

const assetId = '22222222-2222-4222-8222-222222222222'
const intent = {assetId, method: 'PUT', url: 'https://uploads.example/signed', headers: {'content-type': 'image/webp', 'x-upload-token': 'exact'}, expiresAt: '2026-09-04T12:00:00.000Z', maxBytes: 10_485_760}

beforeEach(() => {
  replace.mockReset()
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({width: 800, height: 600, close: vi.fn()}))
  Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: vi.fn(() => 'blob:preview')})
  Object.defineProperty(URL, 'revokeObjectURL', {configurable: true, value: vi.fn()})
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProfileEditor', () => {
  it('uses the current display name for the shared avatar fallback', () => {
    renderEditor({...account, avatarUrl: null, displayName: 'Rui'}, undefined, false)
    expect(screen.getByRole('img', {name: 'Avatar'})).toHaveTextContent('R')
  })

  it('opens avatar actions in a portal with keyboard navigation and outside dismissal', () => {
    const {container} = renderEditor(account, undefined, false)
    const trigger = screen.getByRole('button', {name: 'Avatar'})
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', {name: 'Avatar'})
    expect(container).not.toContainElement(menu)
    expect(screen.getByRole('menuitem', {name: 'Upload avatar'})).toHaveFocus()
    fireEvent.keyDown(menu, {key: 'ArrowDown'})
    expect(screen.getByRole('menuitem', {name: 'Remove avatar'})).toHaveFocus()
    fireEvent.keyDown(menu, {key: 'Escape'})
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
    fireEvent.click(trigger)
    fireEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('separates the background preset selector from custom image actions', () => {
    renderEditor(account, undefined, false)
    fireEvent.click(screen.getByRole('button', {name: 'Background'}))
    expect(screen.getAllByRole('radio')).toHaveLength(7)
    expect(screen.queryByRole('menuitem', {name: 'Upload background'})).toBeNull()
    fireEvent.click(screen.getByRole('button', {name: 'Custom image'}))
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('menuitem', {name: 'Upload background'})).toBeVisible()
    expect(screen.getByRole('menuitem', {name: 'Use color instead'})).toBeDisabled()
  })

  it('renders one standalone accessible form, seven shared colors, and no dialog', () => {
    const {container} = renderEditor(account, undefined, false)

    expect(screen.getByRole('heading', {level: 1, name: 'Edit profile'})).toBeVisible()
    expect(screen.getByRole('form', {name: 'Edit profile'})).toHaveAttribute('id', 'profile-editor-form')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', {name: 'Cancel'})).toBeNull()
    expect(container.querySelectorAll('[data-profile-edit-row]')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', {name: 'Name'}))
    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('Rui')
    fireEvent.click(screen.getByRole('button', {name: 'Background'}))
    expect(Object.keys(PROFILE_BACKGROUND_COLORS)).toEqual(['paper', 'sand', 'mist', 'sage', 'sky', 'lilac', 'graphite'])
    expect(screen.getAllByRole('radio')).toHaveLength(7)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('uploads in intent, exact-header PUT, confirmation order and only publishes on save', async () => {
    const updated = {...account, avatarUrl: 'https://media.example/new.webp', profileVersion: 5}
    const request = vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(intent, {status: 201}))
      .mockResolvedValueOnce(new Response(null, {status: 200}))
      .mockResolvedValueOnce(Response.json({assetId, role: 'avatar'}))
      .mockResolvedValueOnce(Response.json(updated))
    renderEditor()

    fireEvent.change(screen.getByLabelText('Upload avatar'), {target: {files: [imageFile()]}})
    await waitFor(() => expect(screen.getByRole('img', {name: 'Avatar'})).toHaveAttribute('src', 'blob:preview'))

    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/api/me/assets/upload-intent', 'https://uploads.example/signed', `/api/me/assets/${assetId}/confirm`,
    ])
    expect(request.mock.calls[0]?.[1]).toMatchObject({method: 'POST', credentials: 'include'})
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({role: 'avatar', contentType: 'image/webp', sizeBytes: 1200, width: 800, height: 600})
    expect(request.mock.calls[1]?.[1]).toEqual({method: 'PUT', headers: intent.headers, body: expect.any(File), signal: expect.any(AbortSignal)})
    expect(request.mock.calls[2]?.[1]).toMatchObject({method: 'POST', credentials: 'include', body: JSON.stringify({assetId})})
    expect(replace).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/profile?tab=saved#row', {scroll: false}))
    expect(JSON.parse(String(request.mock.calls[3]?.[1]?.body))).toEqual({profileVersion: 4, avatarAssetId: assetId})
  })

  it.each([
    ['invalid type', imageFile({type: 'image/gif'}), 'Use JPEG, PNG, or WebP.'],
    ['oversized file', imageFile({size: 10_485_761}), 'Image must be 10 MB or smaller.'],
  ])('rejects an %s before creating upload intent', async (_label, file, message) => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Upload avatar'), {target: {files: [file]}})
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects invalid image dimensions before upload intent', async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({width: 63, height: 600, close: vi.fn()} as unknown as ImageBitmap)
    renderEditor()
    fireEvent.change(screen.getByLabelText('Upload avatar'), {target: {files: [imageFile()]}})
    expect(await screen.findByRole('alert')).toHaveTextContent('between 64 and 12000')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('revokes object URLs on replacement and unmount', async () => {
    vi.mocked(fetch)
      .mockResolvedValue(Response.json(intent, {status: 201}))
      .mockResolvedValueOnce(Response.json(intent, {status: 201}))
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(Response.json({assetId, role: 'avatar'}))
      .mockResolvedValueOnce(Response.json({...intent, assetId: '33333333-3333-4333-8333-333333333333'}, {status: 201}))
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(Response.json({assetId: '33333333-3333-4333-8333-333333333333', role: 'avatar'}))
    const view = renderEditor()
    const input = screen.getByLabelText('Upload avatar')
    fireEvent.change(input, {target: {files: [imageFile({name: 'one.webp'})]}})
    await waitFor(() => expect(screen.getByRole('img', {name: 'Avatar'})).toHaveAttribute('src', 'blob:preview'))
    fireEvent.change(input, {target: {files: [imageFile({name: 'two.webp'})]}})
    await waitFor(() => expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1))
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('makes background image and colors mutually exclusive and clamps focal values', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(intent, {status: 201}))
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(Response.json({assetId, role: 'background'}))
    renderEditor()

    fireEvent.change(screen.getByLabelText('Upload background'), {target: {files: [imageFile()]}})
    await waitFor(() => expect(screen.getByTestId('background-preview')).toHaveStyle({backgroundImage: 'url("blob:preview")'}))
    expect(screen.getByTestId('background-preview')).toHaveStyle({backgroundPosition: '50% 50%'})
    fireEvent.click(backgroundRadio('Sage'))
    expect(screen.getByRole('radio', {name: 'Sage'})).toBeChecked()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByTestId('background-preview').style.backgroundImage).toBe('')
    expect(clampFocalPoint(-1)).toBe(0)
    expect(clampFocalPoint(2)).toBe(1)
  })

  it('preserves saved focal coordinates and account locale when editing text', async () => {
    const imageAccount = AccountSchema.parse({...account, preferredLocale: 'zh-CN', background: {type: 'image', url: 'https://media.example/background.webp', focalX: 0.25, focalY: 0.75}})
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({...imageAccount, displayName: 'Updated', profileVersion: 5}))
    renderEditor(imageAccount)
    expect(screen.getByTestId('background-preview')).toHaveStyle({backgroundPosition: '25% 75%'})
    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {target: {value: 'Updated'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({profileVersion: 4, displayName: 'Updated'})
  })

  it('disables saved-image focal controls after switching the draft to a color', () => {
    const imageAccount = AccountSchema.parse({...account, background: {type: 'image', url: 'https://media.example/background.webp', focalX: 0.25, focalY: 0.75}})
    renderEditor(imageAccount)

    fireEvent.click(backgroundRadio('Paper'))

    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByTestId('background-preview').style.backgroundImage).toBe('')
  })

  it('refreshes a pristine draft from account updates', () => {
    renderEditor()

    act(() => publishAccountUpdate({...account, displayName: 'Remote Name', profileVersion: 5}))

    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('Remote Name')
  })

  it('keeps a dirty draft and its base version when the shared account advances', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {status: 409}))
    renderEditor()
    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {target: {value: 'Local Draft'}})

    act(() => publishAccountUpdate({...account, displayName: 'Remote Name', profileVersion: 5}))
    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('Local Draft')
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere')
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toMatchObject({profileVersion: 4, displayName: 'Local Draft'})
  })

  it('removes an avatar with null and sends only changed fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({...account, avatarUrl: null, profileVersion: 5}))
    renderEditor()
    fireEvent.click(screen.getByRole('button', {name: 'Avatar'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Remove avatar'}))
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({profileVersion: 4, avatarAssetId: null})
  })

  it('preserves a dirty draft after PATCH failure and does not publish it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {status: 503}))
    renderEditor()
    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {target: {value: 'Draft Name'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Profile could not be saved.')
    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('Draft Name')
    expect(replace).not.toHaveBeenCalled()
  })

  it('offers a conflict refetch without discarding the draft automatically', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {status: 409})).mockResolvedValueOnce(Response.json({...account, displayName: 'Latest', profileVersion: 5}))
    renderEditor()
    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {target: {value: 'Draft Name'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere')
    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('Draft Name')
    fireEvent.click(screen.getByRole('button', {name: 'Reload latest profile'}))
    await waitFor(() => expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('Latest'))
  })

  it('confirms dirty back, never saves, and preserves the return URL', () => {
    renderEditor()
    fireEvent.change(screen.getByRole('textbox', {name: 'Bio'}), {target: {value: 'Unsaved'}})
    vi.mocked(confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', {name: 'Back'}))
    expect(replace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', {name: 'Back'}))
    expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(replace).toHaveBeenCalledWith('/en/profile?tab=saved#row', {scroll: false})
    expect(fetch).not.toHaveBeenCalled()
  })

  it('warns on beforeunload only while dirty and disables controls while uploading', async () => {
    let resolveIntent!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { resolveIntent = resolve }))
    renderEditor()
    const cleanEvent = new Event('beforeunload', {cancelable: true}) as BeforeUnloadEvent
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {target: {value: 'Dirty'}})
    const dirtyEvent = new Event('beforeunload', {cancelable: true}) as BeforeUnloadEvent
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
    fireEvent.change(screen.getByLabelText('Upload avatar'), {target: {files: [imageFile()]}})
    await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled())
    expect(screen.getByLabelText('Upload background')).toBeDisabled()
    await act(async () => resolveIntent(new Response(null, {status: 500})))
    expect(await screen.findByRole('button', {name: 'Retry upload'})).toBeVisible()
  })

  it('makes the latest file authoritative when dimensions resolve out of order', async () => {
    const first = deferred<ImageBitmap>()
    const second = deferred<ImageBitmap>()
    vi.mocked(createImageBitmap).mockImplementation((source) => (source as File).name === 'a.webp' ? first.promise : second.promise)
    vi.mocked(URL.createObjectURL).mockImplementation((file) => `blob:${(file as File).name}`)
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(intent, {status: 201}))
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(Response.json({assetId, role: 'avatar'}))
    renderEditor()
    const input = screen.getByLabelText('Upload avatar')

    fireEvent.change(input, {target: {files: [imageFile({name: 'a.webp', size: 1200})]}})
    fireEvent.change(input, {target: {files: [imageFile({name: 'b.webp', size: 1300})]}})
    await act(async () => second.resolve(bitmap()))
    await waitFor(() => expect(screen.getByRole('img', {name: 'Avatar'})).toHaveAttribute('src', 'blob:b.webp'))
    await act(async () => first.resolve(bitmap()))

    expect(screen.getByRole('img', {name: 'Avatar'})).toHaveAttribute('src', 'blob:b.webp')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toMatchObject({sizeBytes: 1300})
  })

  it('keeps a chosen color authoritative when an earlier image finishes validating', async () => {
    const dimensions = deferred<ImageBitmap>()
    vi.mocked(createImageBitmap).mockReturnValueOnce(dimensions.promise)
    renderEditor()

    fireEvent.change(screen.getByLabelText('Upload background'), {target: {files: [imageFile()]}})
    fireEvent.click(backgroundRadio('Sage'))
    await act(async () => dimensions.resolve(bitmap()))

    expect(screen.getByRole('radio', {name: 'Sage'})).toBeChecked()
    expect(screen.getByTestId('background-preview').style.backgroundImage).toBe('')
    expect(fetch).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('enters validation state synchronously and disables save and the target input before dimensions resolve', () => {
    vi.mocked(createImageBitmap).mockReturnValueOnce(new Promise(() => undefined))
    renderEditor()

    fireEvent.change(screen.getByLabelText('Upload avatar'), {target: {files: [imageFile()]}})

    expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled()
    expect(screen.getByLabelText('Upload avatar')).toBeDisabled()
    expect(screen.getByTestId('avatar-upload-overlay')).toHaveAttribute('aria-label', 'Uploading…')
    expect(screen.queryByText('Uploading…')).toBeNull()
  })

  it('aborts and revokes a stale network upload on replacement, then ignores it after unmount', async () => {
    const pendingIntent = deferred<Response>()
    vi.mocked(URL.createObjectURL).mockImplementation((file) => `blob:${(file as File).name}`)
    vi.mocked(fetch).mockImplementationOnce(() => pendingIntent.promise).mockResolvedValue(new Response(null, {status: 500}))
    const view = renderEditor()
    const input = screen.getByLabelText('Upload avatar')
    fireEvent.change(input, {target: {files: [imageFile({name: 'a.webp'})]}})
    await waitFor(() => expect(screen.getByRole('img', {name: 'Avatar'})).toHaveAttribute('src', 'blob:a.webp'))
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal

    fireEvent.change(input, {target: {files: [imageFile({name: 'b.webp'})]}})

    expect(firstSignal).toBeInstanceOf(AbortSignal)
    expect(firstSignal?.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.webp')
    view.unmount()
    await act(async () => pendingIntent.resolve(new Response(null, {status: 500})))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })
})
