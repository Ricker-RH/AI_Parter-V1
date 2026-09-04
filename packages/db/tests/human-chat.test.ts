import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll, describe, expect, it, vi} from 'vitest'
import {createHumanChatRepository} from '../src/human-chat.js'
import {createActorSession} from '../src/session.js'
import type {QueryClient, WithActor} from '../src/session.js'

const conversationId = 'edc5b166-125d-4af3-ac8c-233a773f66c0'
const profileId = 'edc5b166-125d-4af3-ac8c-233a773f66c1'
const messageId = 'edc5b166-125d-4af3-ac8c-233a773f66c2'
const requestId = 'edc5b166-125d-4af3-ac8c-233a773f66c3'
const actor = {subject: 'authenticated-subject'}
const highId = 'fdc5b166-125d-4af3-ac8c-233a773f66c1'
const conversationRow = {id: conversationId, created_at: '2026-09-04T00:00:00.123456Z', updated_at: '2026-09-04T00:00:00.123456Z', low_identity: {id: profileId, username: 'human_low', displayName: 'Low', avatarKey: null}, high_identity: {id: highId, username: 'human_high', displayName: 'High', avatarKey: null}, latest_message: null, unread_count: '0', read_sequence: '0'}
function setup(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async () => ({rows, rowCount: rows.length}))
  const client = {query, release: vi.fn()} as unknown as QueryClient
  const session = vi.fn(async (_actor, callback) => callback(client)) as WithActor
  return {query, session, repository: createHumanChatRepository({withActor: session})}
}
const row = {id: messageId, conversation_id: conversationId, sender_profile_id: profileId, client_request_id: requestId, sequence: '1', content: {kind: 'text', text: 'hello'}, created_at: new Date('2026-09-04T00:00:00Z')}

describe('human chat repository boundary', () => {
  it('opens via actor-scoped command then projects only safe participant identities', async () => {
    const {repository, query, session} = setup([conversationRow])
    const result = await repository.open(actor, {peerProfileId: highId})
    expect(result).toMatchObject({v: 1, id: conversationId, participants: [{kind: 'HUMAN', id: profileId}, {kind: 'HUMAN', id: highId}]})
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('human_dm_open'), [highId])
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('human_public_profile'), [conversationId])
    expect(session).toHaveBeenCalledWith(actor, expect.any(Function))
  })
  it('lists bounded participant inbox rows with stable microsecond cursor and real unread count', async () => {
    const {repository, query} = setup([{...conversationRow, latest_message: row, unread_count: '2'}, {...conversationRow, id: requestId}])
    const page = await repository.list(actor, {limit: 1})
    expect(page.items).toHaveLength(1); expect(page.items[0]).toMatchObject({unreadCount: 2, lastReadSequence: 0, latestMessage: {sequence: 1}})
    expect(page.nextCursor).toEqual(expect.any(String))
    await repository.list(actor, {limit: 1, cursor: page.nextCursor!})
    expect(query).toHaveBeenLastCalledWith(expect.stringMatching(/ORDER BY c.updated_at DESC, c.id DESC/), ['2026-09-04T00:00:00.123456Z', conversationId, 2])
    expect(query.mock.calls[0]?.[0]).toMatch(/sender_profile_id <> public.current_profile_id\(\)/)
    expect(query.mock.calls[0]?.[0]).not.toMatch(/email|auth_subject/)
    expect(query.mock.calls[0]?.[0]).toContain("m.created_at AT TIME ZONE 'UTC'")
  })
  it('rejects invalid limits, cursors and forged open fields before database access', async () => {
    const {repository, query} = setup()
    for (const input of [{limit: 0}, {limit: 101}, {limit: 1, cursor: 'bad'}, {limit: 1, cursor: 'x'.repeat(513)}]) await expect(repository.list(actor, input)).rejects.toThrow()
    await expect(repository.open(actor, {peerProfileId: highId, senderProfileId: profileId} as never)).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
  it('validates avatar ownership and safe database counts instead of exposing storage keys', async () => {
    const {repository} = setup([{...conversationRow, high_identity: {...conversationRow.high_identity, avatarKey: `public/profiles/${profileId}/avatar/${requestId}.webp`}}])
    await expect(repository.list(actor, {limit: 10})).rejects.toThrow()
    const invalid = setup([{...conversationRow, unread_count: '9007199254740993'}])
    await expect(invalid.repository.list(actor, {limit: 10})).rejects.toThrow()
  })
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

const connectionString = process.env.HUMAN_DM_TEST_DATABASE_URL
const integration = connectionString ? describe : describe.skip
integration('human inbox live PostgreSQL participant boundaries', () => {
  const pool = new Pool({connectionString})
  afterAll(async () => {await pool.end()})
  it('projects participant identities, excludes outsiders, preserves blocked history and paginates without duplicates', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const people = Array.from({length: 4}, () => {const id = randomUUID(); return {id, subject: `inbox-${id}`}})
      for (const person of people) await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Inbox human')", [person.id, person.subject, `inbox_${person.id.replaceAll('-', '').slice(0, 18)}`])
      const [a, b, c, outsider] = people as [typeof people[number], typeof people[number], typeof people[number], typeof people[number]]
      const wrapper = {query: client.query.bind(client), release: () => {}} as QueryClient
      const {withActor} = createActorSession({connect: async () => wrapper}, {transactionMode: 'nested'})
      const repository = createHumanChatRepository({withActor})
      const opened = await repository.open(a, {peerProfileId: b.id})
      expect(opened.participants.map(person => person.id).sort()).toEqual([a.id, b.id].sort())
      expect(await repository.list(a, {limit: 10})).toMatchObject({items: [{latestMessage: null, unreadCount: 0, lastReadSequence: 0}], nextCursor: null})
      await repository.send(b, {peerProfileId: a.id, clientRequestId: randomUUID(), content: {kind: 'text', text: 'private hello'}})
      expect((await repository.list(a, {limit: 10})).items[0]).toMatchObject({unreadCount: 1, latestMessage: {content: {kind: 'text', text: 'private hello'}}})
      expect((await repository.list(b, {limit: 10})).items[0]?.unreadCount).toBe(0)
      await repository.open(a, {peerProfileId: c.id})
      const first = await repository.list(a, {limit: 1})
      const second = await repository.list(a, {limit: 1, cursor: first.nextCursor!})
      expect(first.items).toHaveLength(1); expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull()
      expect(first.items[0]?.conversation.id).not.toBe(second.items[0]?.conversation.id)
      expect(await repository.list(outsider, {limit: 10, cursor: first.nextCursor!})).toEqual({items: [], nextCursor: null})
      await repository.markRead(a, {conversationId: opened.id, lastReadSequence: 1})
      await withActor(a, async scoped => {await scoped.query('SELECT public.human_block_profile($1)', [b.id])})
      const blocked = (await repository.list(a, {limit: 10})).items.find(item => item.conversation.id === opened.id)
      expect(blocked).toMatchObject({unreadCount: 0, lastReadSequence: 1, latestMessage: {content: {text: 'private hello'}}})
      await expect(repository.send(a, {peerProfileId: b.id, clientRequestId: randomUUID(), content: {kind: 'text', text: 'blocked'}})).rejects.toMatchObject({code: 'PDM01'})
    } finally {await client.query('ROLLBACK'); client.release()}
  })
})
