import {describe, expect, it, vi} from 'vitest'
import {createHumanChatRepository} from '../src/human-chat.js'
import type {QueryClient, WithActor} from '../src/session.js'

const conversationId = 'edc5b166-125d-4af3-ac8c-233a773f66c0'
const profileId = 'edc5b166-125d-4af3-ac8c-233a773f66c1'
const messageId = 'edc5b166-125d-4af3-ac8c-233a773f66c2'
const requestId = 'edc5b166-125d-4af3-ac8c-233a773f66c3'
const actor = {subject: 'authenticated-subject'}
function setup(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async () => ({rows, rowCount: rows.length}))
  const client = {query, release: vi.fn()} as unknown as QueryClient
  const session = vi.fn(async (_actor, callback) => callback(client)) as WithActor
  return {query, session, repository: createHumanChatRepository({withActor: session})}
}
const row = {id: messageId, conversation_id: conversationId, sender_profile_id: profileId, client_request_id: requestId, sequence: '1', content: {kind: 'text', text: 'hello'}, created_at: new Date('2026-09-04T00:00:00Z')}

describe('human chat repository boundary', () => {
  it('sends through bounded DB command under authenticated actor, never supplied sender', async () => {
    const {repository, query, session} = setup([row])
    const message = await repository.send(actor, {peerProfileId: profileId, clientRequestId: requestId, content: {kind: 'text', text: 'hello'}})
    expect(session).toHaveBeenCalledWith(actor, expect.any(Function))
    expect(query).toHaveBeenCalledWith(expect.stringContaining('human_dm_send'), [profileId, JSON.stringify(row.content), requestId])
    expect(message).toMatchObject({v: 1, id: messageId, sequence: 1, senderProfileId: profileId})
  })
  it('rejects forged send fields before querying', async () => {
    const {repository, query} = setup([row])
    await expect(repository.send(actor, {peerProfileId: profileId, clientRequestId: requestId, content: row.content, senderProfileId: profileId} as never)).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
  it('bounds history and uses parameterized sequence-based catchup', async () => {
    const {repository, query} = setup([row])
    expect(await repository.history(actor, {conversationId, afterSequence: 0, limit: 50})).toHaveLength(1)
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/sequence > \$2[\s\S]*ORDER BY sequence ASC/), [conversationId, 0, 50])
    await expect(repository.history(actor, {conversationId, afterSequence: -1, limit: 500})).rejects.toThrow()
  })
  it('marks read only through the bounded actor-scoped command', async () => {
    const {repository, query} = setup([{read_sequence: '3'}])
    expect(await repository.markRead(actor, {conversationId, lastReadSequence: 3})).toBe(3)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('human_dm_mark_read'), [conversationId, 3])
  })
  it('does not silently round database sequence overflow', async () => {
    const {repository} = setup([{...row, sequence: '9007199254740993'}])
    await expect(repository.history(actor, {conversationId, afterSequence: 0, limit: 50})).rejects.toThrow()
  })
})
