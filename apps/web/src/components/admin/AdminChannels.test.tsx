import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {AdminChannels, type AdminChannelsLabels} from './AdminChannels.js'
import en from '../../../messages/en.json'
import zhCN from '../../../messages/zh-CN.json'

const labels: AdminChannelsLabels = {
  title: 'Channels', description: 'Create and curate channels.', createTitle: 'Create channel', slug: 'Slug', name: 'Name', channelDescription: 'Description', sortOrder: 'Sort order', create: 'Create', creating: 'Creating…',
  editTitle: 'Edit channel', save: 'Save changes', saving: 'Saving…', publish: 'Publish', archive: 'Archive', aliases: 'Aliases', aliasesHint: 'Comma-separated', saveAliases: 'Save aliases',
  channelList: 'Existing channels', loadingChannels: 'Loading channels…', channelsUnavailable: 'Unable to load channels.', retry: 'Retry', loadMore: 'Load more', ipCount: 'IPs',
  ipProfileId: 'IP profile ID', primary: 'Primary channel', curationWeight: 'Curation weight', assignIp: 'Assign IP', removeIp: 'Remove IP', success: 'Saved.', requestFailed: 'Request failed.',
}
const id = '11111111-1111-4111-8111-111111111111'
const record = {id, slug: 'future-city', name: 'Future City', description: 'Urban futures', imageUrl: null, ipCount: 0, status: 'draft', sortOrder: 2, aliases: [], createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z'}
const archived = {...record, id: '22222222-2222-4222-8222-222222222222', slug: 'retro-tech', name: 'Retro Tech', status: 'archived', aliases: ['retro', '复古科技'], ipCount: 7}

describe('AdminChannels', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it.each([[en.adminChannels, 'Existing channels'], [zhCN.adminChannels, '现有频道']] as const)('localizes the existing-channel loader', async (messages, listLabel) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({items: [], nextCursor: null})))
    render(<AdminChannels labels={messages} />)
    expect(await screen.findByRole('region', {name: listLabel})).toBeVisible()
  })

  it('loads existing channels and selects their real management fields after a fresh mount', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({items: [record, archived], nextCursor: null}))
    vi.stubGlobal('fetch', request)

    render(<AdminChannels labels={labels} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading channels…')
    const selector = await screen.findByRole('combobox', {name: 'Existing channels'})
    expect(request).toHaveBeenCalledWith('/api/admin/channels?limit=25', expect.objectContaining({method: 'GET'}))
    expect(selector).toHaveValue(id)
    fireEvent.change(selector, {target: {value: archived.id}})
    const editor = screen.getByRole('region', {name: 'Edit channel'})
    expect(within(editor).getByLabelText('Aliases')).toHaveValue('retro, 复古科技')
    expect(within(editor).getByText('7 IPs')).toBeVisible()
    expect(within(editor).getByText(/retro-tech · archived/)).toBeVisible()
  })

  it('shows a retryable error when the initial channel list cannot be loaded', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({code: 'ADMIN_UNAVAILABLE'}, {status: 503}))
      .mockResolvedValueOnce(Response.json({items: [record], nextCursor: null}))
    vi.stubGlobal('fetch', request)

    render(<AdminChannels labels={labels} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load channels.')
    fireEvent.click(screen.getByRole('button', {name: 'Retry'}))
    expect(await screen.findByRole('combobox', {name: 'Existing channels'})).toHaveValue(id)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('appends the next page without losing the selected channel', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({items: [record], nextCursor: 'page-2'}))
      .mockResolvedValueOnce(Response.json({items: [archived], nextCursor: null}))
    vi.stubGlobal('fetch', request)

    render(<AdminChannels labels={labels} />)
    const selector = await screen.findByRole('combobox', {name: 'Existing channels'})
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}))

    await waitFor(() => expect(within(selector).getAllByRole('option')).toHaveLength(2))
    expect(selector).toHaveValue(id)
    expect(request).toHaveBeenNthCalledWith(2, '/api/admin/channels?limit=25&cursor=page-2', expect.objectContaining({method: 'GET'}))
  })

  it('reloads and selects the authoritative record after creation', async () => {
    const authoritative = {...record, aliases: ['server-alias'], ipCount: 3}
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({items: [], nextCursor: null}))
      .mockResolvedValueOnce(Response.json(record, {status: 201}))
      .mockResolvedValueOnce(Response.json(authoritative))
    vi.stubGlobal('fetch', request)
    render(<AdminChannels labels={labels} />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Slug'), {target: {value: 'future-city'}})
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Future City'}})
    fireEvent.click(screen.getByRole('button', {name: 'Create'}))

    const editor = await screen.findByRole('region', {name: 'Edit channel'})
    await waitFor(() => expect(request).toHaveBeenNthCalledWith(3, `/api/admin/channels/${id}`, expect.objectContaining({method: 'GET'})))
    expect(within(editor).getByLabelText('Aliases')).toHaveValue('server-alias')
    expect(within(editor).getByText('3 IPs')).toBeVisible()
  })

  it('reloads the selected authoritative record after edits and management actions', async () => {
    let edited = false
    const request = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'GET' && url.includes('?')) return Response.json({items: [record], nextCursor: 'page-2'})
      if (options?.method === 'GET') return Response.json({...record, name: edited ? 'Canonical Future City' : record.name})
      if (options?.method === 'PATCH') {edited = true; return Response.json({...record, name: 'Future City Lab'})}
      return new Response(null, {status: 204})
    })
    vi.stubGlobal('fetch', request)
    render(<AdminChannels labels={labels} />)
    const editor = await screen.findByRole('region', {name: 'Edit channel'})

    fireEvent.change(within(editor).getByLabelText('Name'), {target: {value: 'Future City Lab'}})
    fireEvent.click(within(editor).getByRole('button', {name: 'Save changes'}))
    await waitFor(() => expect(request.mock.calls.filter(([, options]) => options?.method === 'GET')).toHaveLength(2))
    expect(within(editor).getByLabelText('Name')).toHaveValue('Canonical Future City')
    expect(screen.getByRole('button', {name: 'Load more'})).toBeVisible()

    fireEvent.click(within(editor).getByRole('button', {name: 'Publish'}))
    await waitFor(() => expect(request.mock.calls.filter(([, options]) => options?.method === 'GET')).toHaveLength(3))
    expect(request).toHaveBeenCalledWith(`/api/admin/channels/${id}`, expect.objectContaining({method: 'GET'}))
  })

  it('reports an error instead of success when authoritative refresh fails', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({items: [record], nextCursor: null}))
      .mockResolvedValueOnce(Response.json({...record, name: 'Future City Lab'}))
      .mockResolvedValueOnce(Response.json({code: 'ADMIN_UNAVAILABLE'}, {status: 503}))
    vi.stubGlobal('fetch', request)
    render(<AdminChannels labels={labels} />)
    const editor = await screen.findByRole('region', {name: 'Edit channel'})

    fireEvent.change(within(editor).getByLabelText('Name'), {target: {value: 'Future City Lab'}})
    fireEvent.click(within(editor).getByRole('button', {name: 'Save changes'}))

    expect(await within(editor).findByRole('alert')).toHaveTextContent('Request failed.')
    expect(within(editor).queryByText('Saved.')).toBeNull()
  })

  it('disables every mutation while pending and does not reselect a channel after the operator switches', async () => {
    let resolvePublish!: (response: Response) => void
    const publish = new Promise<Response>((resolve) => {resolvePublish = resolve})
    const request = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'GET' && url.includes('?')) return Response.json({items: [record, archived], nextCursor: null})
      if (url.endsWith('/publish')) return publish
      if (options?.method === 'GET') return Response.json(record)
      return new Response(null, {status: 204})
    })
    vi.stubGlobal('fetch', request)
    render(<AdminChannels labels={labels} />)
    const selector = await screen.findByRole('combobox', {name: 'Existing channels'})
    const editor = screen.getByRole('region', {name: 'Edit channel'})

    fireEvent.click(within(editor).getByRole('button', {name: 'Publish'}))
    for (const name of ['Saving…', 'Publish', 'Archive', 'Save aliases', 'Assign IP', 'Remove IP']) {
      expect(within(editor).getByRole('button', {name})).toBeDisabled()
    }
    fireEvent.change(selector, {target: {value: archived.id}})
    await act(async () => resolvePublish(new Response(null, {status: 204})))

    await waitFor(() => expect(selector).toHaveValue(archived.id))
    expect(screen.getByRole('region', {name: 'Edit channel'})).toHaveTextContent('retro-tech · archived')
  })

  it('creates a channel then supports edit, publish/archive, aliases, primary assignment and weight', async () => {
    let listCalls = 0
    const request = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'GET' && url.includes('?')) return Response.json({items: listCalls++ ? [record] : [], nextCursor: null})
      if (options?.method === 'GET') return Response.json(record)
      if (url === '/api/admin/channels') return Response.json(record, {status: 201})
      if (options?.method === 'PATCH') return Response.json({...record, name: 'Future City Lab'})
      return new Response(null, {status: 204})
    })
    vi.stubGlobal('fetch', request)
    render(<AdminChannels labels={labels} />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Slug'), {target: {value: 'future-city'}})
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Future City'}})
    fireEvent.click(screen.getByRole('button', {name: 'Create'}))
    const editor = await screen.findByRole('region', {name: 'Edit channel'})
    expect(request).toHaveBeenCalledWith('/api/admin/channels', expect.objectContaining({method: 'POST', body: JSON.stringify({slug: 'future-city', name: 'Future City', description: '', sortOrder: 0})}))

    const waitForMutation = async (path: string, method: string) => {
      await waitFor(() => expect(request).toHaveBeenCalledWith(path, expect.objectContaining({method})))
      await waitFor(() => expect(within(editor).getByRole('button', {name: 'Save changes'})).toBeEnabled())
    }

    fireEvent.change(within(editor).getByLabelText('Name'), {target: {value: 'Future City Lab'}})
    fireEvent.click(within(editor).getByRole('button', {name: 'Save changes'}))
    await waitForMutation(`/api/admin/channels/${id}`, 'PATCH')

    fireEvent.click(within(editor).getByRole('button', {name: 'Publish'}))
    await waitForMutation(`/api/admin/channels/${id}/publish`, 'POST')
    fireEvent.click(within(editor).getByRole('button', {name: 'Archive'}))
    await waitForMutation(`/api/admin/channels/${id}/archive`, 'POST')
    fireEvent.change(within(editor).getByLabelText('Aliases'), {target: {value: 'AI cities, 智慧城市'}})
    fireEvent.click(within(editor).getByRole('button', {name: 'Save aliases'}))
    await waitForMutation(`/api/admin/channels/${id}/aliases`, 'PUT')
    fireEvent.change(within(editor).getByLabelText('IP profile ID'), {target: {value: id}})
    fireEvent.click(within(editor).getByLabelText('Primary channel'))
    fireEvent.change(within(editor).getByLabelText('Curation weight'), {target: {value: '8'}})
    fireEvent.click(within(editor).getByRole('button', {name: 'Assign IP'}))
    await waitForMutation(`/api/admin/channels/${id}/profiles`, 'PUT')

    expect(request).toHaveBeenCalledWith(`/api/admin/channels/${id}/publish`, expect.objectContaining({method: 'POST'}))
    expect(request).toHaveBeenCalledWith(`/api/admin/channels/${id}/archive`, expect.objectContaining({method: 'POST'}))
    expect(request).toHaveBeenCalledWith(`/api/admin/channels/${id}/aliases`, expect.objectContaining({method: 'PUT', body: JSON.stringify({aliases: ['AI cities', '智慧城市']})}))
    expect(request).toHaveBeenCalledWith(`/api/admin/channels/${id}/profiles`, expect.objectContaining({method: 'PUT', body: JSON.stringify({ipProfileId: id, isPrimary: true, curationWeight: 8})}))
    fireEvent.click(within(editor).getByRole('button', {name: 'Remove IP'}))
    await waitForMutation(`/api/admin/channels/${id}/profiles/${id}`, 'DELETE')
  })

  it('renders inline errors and remains retryable', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({items: [], nextCursor: null}))
      .mockResolvedValue(Response.json({code: 'INVALID_REQUEST'}, {status: 422}))
    vi.stubGlobal('fetch', request)
    render(<AdminChannels labels={labels} />)
    fireEvent.change(screen.getByLabelText('Slug'), {target: {value: 'future-city'}})
    fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'Future City'}})
    fireEvent.click(screen.getByRole('button', {name: 'Create'}))
    expect(await screen.findByText('Request failed.')).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', {name: 'Create'})).toBeEnabled()
  })
})
