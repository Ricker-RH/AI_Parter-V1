import {AccountSchema, type Account} from '@aifans/contracts'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {CurrentAccountProvider, publishAccountUpdate} from '../account/CurrentAccountProvider.js'
import {PROFILE_BACKGROUND_COLORS, ProfileEditor, clampFocalPoint, type ProfileEditorLabels} from './ProfileEditor.js'

const {replace} = vi.hoisted(() => ({replace: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({replace})}))

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

function renderEditor(initial: Account = account, returnTo = '/en/profile?tab=saved#row') {
  return render(<CurrentAccountProvider initialAccount={initial}><ProfileEditor labels={labels} locale="en" returnTo={returnTo}/></CurrentAccountProvider>)
}

function imageFile({name = 'photo.webp', size = 1200, type = 'image/webp'} = {}) {
  return new File([new Uint8Array(size)], name, {type})
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
  it('renders one standalone accessible form, seven shared colors, and no dialog', () => {
    const {container} = renderEditor()

    expect(screen.getByRole('heading', {level: 1, name: 'Edit profile'})).toBeVisible()
    expect(screen.getByRole('form', {name: 'Edit profile'})).toHaveAttribute('id', 'profile-editor-form')
    expect(screen.getByLabelText('Name')).toHaveValue('Rui')
    expect(screen.getByLabelText('Upload avatar')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(screen.getByLabelText('Horizontal focus')).toBeDisabled()
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
    expect(request.mock.calls[1]?.[1]).toEqual({method: 'PUT', headers: intent.headers, body: expect.any(File)})
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
    await waitFor(() => expect(screen.getByLabelText('Horizontal focus')).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Horizontal focus'), {target: {value: '0.75'}})
    expect(screen.getByTestId('background-preview')).toHaveStyle({backgroundPosition: '75% 50%'})
    fireEvent.click(screen.getByRole('radio', {name: 'Sage'}))
    expect(screen.getByRole('radio', {name: 'Sage'})).toBeChecked()
    expect(screen.getByLabelText('Horizontal focus')).toBeDisabled()
    expect(screen.getByTestId('background-preview').style.backgroundImage).toBe('')
    expect(clampFocalPoint(-1)).toBe(0)
    expect(clampFocalPoint(2)).toBe(1)
  })

  it('edits focal coordinates for an existing saved background without uploading again', async () => {
    const imageAccount = AccountSchema.parse({...account, background: {type: 'image', url: 'https://media.example/background.webp', focalX: 0.25, focalY: 0.75}})
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({...imageAccount, profileVersion: 5, background: {...imageAccount.background, focalX: 0.4, focalY: 0.6}}))
    renderEditor(imageAccount)

    expect(screen.getByLabelText('Horizontal focus')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Horizontal focus'), {target: {value: '0.4'}})
    fireEvent.change(screen.getByLabelText('Vertical focus'), {target: {value: '0.6'}})
    expect(screen.getByTestId('background-preview')).toHaveStyle({backgroundImage: 'url("https://media.example/background.webp")', backgroundPosition: '40% 60%'})
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({
      profileVersion: 4,
      background: {type: 'image', focalX: 0.4, focalY: 0.6},
    })
  })

  it('disables saved-image focal controls after switching the draft to a color', () => {
    const imageAccount = AccountSchema.parse({...account, background: {type: 'image', url: 'https://media.example/background.webp', focalX: 0.25, focalY: 0.75}})
    renderEditor(imageAccount)

    fireEvent.click(screen.getByRole('radio', {name: 'Paper'}))

    expect(screen.getByLabelText('Horizontal focus')).toBeDisabled()
    expect(screen.getByTestId('background-preview').style.backgroundImage).toBe('')
  })

  it('refreshes a pristine draft from account updates', () => {
    renderEditor()

    act(() => publishAccountUpdate({...account, displayName: 'Remote Name', profileVersion: 5}))

    expect(screen.getByLabelText('Name')).toHaveValue('Remote Name')
  })

  it('keeps a dirty draft and its base version when the shared account advances', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {status: 409}))
    renderEditor()
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Local Draft'}})

    act(() => publishAccountUpdate({...account, displayName: 'Remote Name', profileVersion: 5}))
    expect(screen.getByLabelText('Name')).toHaveValue('Local Draft')
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))

    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere')
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toMatchObject({profileVersion: 4, displayName: 'Local Draft'})
  })

  it('removes an avatar with null and sends only changed fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({...account, avatarUrl: null, profileVersion: 5}))
    renderEditor()
    fireEvent.click(screen.getByRole('button', {name: 'Remove avatar'}))
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({profileVersion: 4, avatarAssetId: null})
  })

  it('preserves a dirty draft after PATCH failure and does not publish it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {status: 503}))
    renderEditor()
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Draft Name'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Profile could not be saved.')
    expect(screen.getByLabelText('Name')).toHaveValue('Draft Name')
    expect(replace).not.toHaveBeenCalled()
  })

  it('offers a conflict refetch without discarding the draft automatically', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {status: 409})).mockResolvedValueOnce(Response.json({...account, displayName: 'Latest', profileVersion: 5}))
    renderEditor()
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Draft Name'}})
    fireEvent.click(screen.getByRole('button', {name: 'Save'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere')
    expect(screen.getByLabelText('Name')).toHaveValue('Draft Name')
    fireEvent.click(screen.getByRole('button', {name: 'Reload latest profile'}))
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Latest'))
  })

  it('confirms dirty cancel/back, never saves, and preserves the return URL', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Bio'), {target: {value: 'Unsaved'}})
    vi.mocked(confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}))
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
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Dirty'}})
    const dirtyEvent = new Event('beforeunload', {cancelable: true}) as BeforeUnloadEvent
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
    fireEvent.change(screen.getByLabelText('Upload avatar'), {target: {files: [imageFile()]}})
    await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled())
    expect(screen.getByLabelText('Upload background')).toBeDisabled()
    await act(async () => resolveIntent(new Response(null, {status: 500})))
    expect(await screen.findByRole('button', {name: 'Retry upload'})).toBeVisible()
  })
})
