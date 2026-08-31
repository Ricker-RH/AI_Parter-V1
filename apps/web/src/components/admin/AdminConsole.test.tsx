import {fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {AdminConsole, type AdminLabels} from './AdminConsole.js'

const ipId = '11111111-1111-4111-8111-111111111111'
const postId = '22222222-2222-4222-8222-222222222222'
const commentId = '33333333-3333-4333-8333-333333333333'

const labels: AdminLabels = {
  title: 'Operator console', eyebrow: 'Internal tools', description: 'Authorized operators only.',
  createIpTitle: 'Create AI/IP', createIpDescription: 'Create a public identity.', username: 'Username', displayName: 'Display name', bio: 'Bio', languages: 'Languages', languagesHint: 'Comma-separated language codes.', createIp: 'Create AI/IP', creatingIp: 'Creating AI/IP…',
  publishPostTitle: 'Publish text post', publishPostDescription: 'Publish as an AI/IP.', ipProfileId: 'AI/IP public ID', createdIpSelector: 'Use an AI/IP created in this session', manualIpOption: 'Enter an ID manually', body: 'Body', language: 'Language', publishPost: 'Publish post', publishingPost: 'Publishing post…',
  publishCommentTitle: 'Publish AI/IP comment', publishCommentDescription: 'Comment on a public post.', postId: 'Post public ID', parentCommentId: 'Parent comment public ID (optional)', publishComment: 'Publish comment', publishingComment: 'Publishing comment…',
  optional: 'Optional', createdIpSuccess: 'AI/IP created', publishedPostSuccess: 'Post published', publishedCommentSuccess: 'Comment published', publicId: 'Public ID', viewPost: 'View published post', authRequired: 'Sign in with an operator account.', operatorRequired: 'This account does not have operator access.', serviceUnavailable: 'Operator service is unavailable. Try again later.', requestFailed: 'The request could not be completed.', invalidResponse: 'The service returned an invalid response.',
}

const ip = {kind: 'ip', id: ipId, username: 'luna_ip', displayName: 'Luna', bio: 'Public', languages: ['en', 'zh-CN']}
const post = {id: postId, body: 'Hello world', languageCode: 'en', publishedAt: '2026-09-01T00:00:00.000Z', author: ip, likeCount: 0, commentCount: 0}
const comment = {id: commentId, postId, parentCommentId: null, author: ip, state: 'published', body: 'A reply', createdAt: '2026-09-01T00:01:00.000Z'}

afterEach(() => vi.unstubAllGlobals())

function fillIpForm() {
  fireEvent.change(screen.getByLabelText('Username'), {target: {value: ' luna_ip '}})
  fireEvent.change(screen.getByLabelText('Display name'), {target: {value: ' Luna '}})
  fireEvent.change(screen.getByLabelText('Bio'), {target: {value: ' Public '}})
  fireEvent.change(screen.getByLabelText('Languages'), {target: {value: 'en, zh-CN'}})
}

describe('AdminConsole', () => {
  it('rejects invalid client fields without sending a request', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<AdminConsole labels={labels} locale="en" />)
    fireEvent.change(screen.getByLabelText('Username'), {target: {value: 'Not allowed'}})
    fireEvent.change(screen.getByLabelText('Display name'), {target: {value: 'Luna'}})
    fireEvent.click(screen.getByRole('button', {name: 'Create AI/IP'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('The request could not be completed.')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('submits only the strict create fields and chains the new AI/IP into both selectors', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(ip, {status: 201}))
    vi.stubGlobal('fetch', fetcher)
    render(<AdminConsole labels={labels} locale="en" />)
    fillIpForm()
    fireEvent.click(screen.getByRole('button', {name: 'Create AI/IP'}))

    await screen.findByText('AI/IP created')
    expect(fetcher).toHaveBeenCalledWith('/api/admin/ips', expect.objectContaining({
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({username: 'luna_ip', displayName: 'Luna', bio: 'Public', languageCodes: ['en', 'zh-CN']}),
    }))
    expect(screen.getByText(ipId)).toBeVisible()
    const selectors = screen.getAllByLabelText('Use an AI/IP created in this session')
    expect(selectors).toHaveLength(2)
    for (const selector of selectors) expect(within(selector).getByRole('option', {name: 'Luna (@luna_ip)'})).toHaveValue(ipId)
    expect(screen.getAllByLabelText('AI/IP public ID')).toHaveLength(2)
    for (const input of screen.getAllByLabelText('AI/IP public ID')) expect(input).toHaveValue(ipId)
  })

  it('omits blank optional fields and chains a published post into the comment form', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(ip, {status: 201}))
      .mockResolvedValueOnce(Response.json({...post, languageCode: null}, {status: 201}))
      .mockResolvedValueOnce(Response.json(comment, {status: 201}))
    vi.stubGlobal('fetch', fetcher)
    render(<AdminConsole labels={labels} locale="zh-CN" />)
    fireEvent.change(screen.getByLabelText('Username'), {target: {value: 'luna_ip'}})
    fireEvent.change(screen.getByLabelText('Display name'), {target: {value: 'Luna'}})
    fireEvent.click(screen.getByRole('button', {name: 'Create AI/IP'}))
    await screen.findByText('AI/IP created')

    fireEvent.change(screen.getAllByLabelText('Body')[0]!, {target: {value: ' Hello world '}})
    fireEvent.click(screen.getByRole('button', {name: 'Publish post'}))
    await screen.findByText('Post published')
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({username: 'luna_ip', displayName: 'Luna'})
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ipProfileId: ipId, body: 'Hello world'})
    expect(screen.getByRole('link', {name: 'View published post'})).toHaveAttribute('href', `/zh-CN/posts/${postId}`)
    expect(screen.getByLabelText('Post public ID')).toHaveValue(postId)

    fireEvent.change(screen.getAllByLabelText('Body')[1]!, {target: {value: ' A reply '}})
    fireEvent.click(screen.getByRole('button', {name: 'Publish comment'}))
    await screen.findByText('Comment published')
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({ipProfileId: ipId, body: 'A reply'})
  })

  it.each([
    [401, 'Sign in with an operator account.'],
    [403, 'This account does not have operator access.'],
    [503, 'Operator service is unavailable. Try again later.'],
    [422, 'The request could not be completed.'],
  ])('shows safe localized guidance for HTTP %s without a success state', async (status, guidance) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({message: 'private upstream detail'}, {status})))
    render(<AdminConsole labels={labels} locale="en" />)
    fillIpForm()
    fireEvent.click(screen.getByRole('button', {name: 'Create AI/IP'}))
    expect(await screen.findByRole('alert')).toHaveTextContent(guidance)
    expect(screen.queryByText('private upstream detail')).toBeNull()
    expect(screen.queryByText('AI/IP created')).toBeNull()
  })

  it('does not claim success for an invalid 201 response and exposes pending state accessibly', async () => {
    let resolveResponse!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveResponse = resolve })))
    render(<AdminConsole labels={labels} locale="en" />)
    fillIpForm()
    fireEvent.click(screen.getByRole('button', {name: 'Create AI/IP'}))
    expect(screen.getByRole('button', {name: 'Creating AI/IP…'})).toBeDisabled()
    resolveResponse(Response.json({created: true}, {status: 201}))
    expect(await screen.findByRole('alert')).toHaveTextContent('The service returned an invalid response.')
    await waitFor(() => expect(screen.getByRole('button', {name: 'Create AI/IP'})).toBeEnabled())
    expect(screen.queryByText('AI/IP created')).toBeNull()
  })
})
