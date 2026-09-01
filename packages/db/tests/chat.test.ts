import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'
import {decodeChatConversationCursor, decodeChatMessageCursor} from '@aifans/contracts'
import {createChatRepository} from '../src/chat.js'
import {createActorSession, type Actor, type QueryClient, type QueryResult, type WithActor} from '../src/session.js'

const actor: Actor = {subject: 'human-subject'}
const conversationId = '00000000-0000-4000-8000-000000000001'
const humanProfileId = '00000000-0000-4000-8000-000000000002'
const ipProfileId = '00000000-0000-4000-8000-000000000003'
const humanMessageId = '00000000-0000-4000-8000-000000000004'
const assistantMessageId = '00000000-0000-4000-8000-000000000005'
const requestId = '00000000-0000-4000-8000-000000000006'
const now = '2026-09-02T00:00:00.000Z'
const later = '2026-09-02T01:00:00.000Z'
const integrationConnectionString = process.env.DATABASE_URL ?? ''
const describeIntegration = integrationConnectionString ? describe : describe.skip
const integrationPool = new Pool({connectionString: integrationConnectionString})

type Row = Record<string, unknown>
function result<RowType extends Row>(rows: RowType[]): QueryResult<RowType> { return {rows, rowCount: rows.length} }
function conversationRow(overrides: Row = {}): Row {
  return {
    id: conversationId, ip_profile_id: ipProfileId, username: 'sage_ip', display_name: 'Sage',
    updated_at: later, last_body: 'Newest', last_role: 'assistant', last_created_at: later,
    provider_conversation_id: 'provider-conversation-secret', ...overrides,
  }
}
function messageRow(overrides: Row = {}): Row {
  return {
    id: humanMessageId, conversation_id: conversationId, role: 'human', body: 'Hello',
    delivery_state: 'pending', client_request_id: requestId, created_at: now,
    human_profile_id: humanProfileId, ip_profile_id: ipProfileId,
    provider_conversation_id: 'provider-conversation-secret', provider_message_id: 'provider-message-secret', ...overrides,
  }
}
function fakeWithActor(responses: Array<QueryResult<Row>>) {
  const queries: Array<{text: string; values: unknown[] | undefined}> = []
  let receivedActor: Actor | undefined
  const client: QueryClient = {
    async query(text, values) {
      queries.push({text, values})
      return (responses.shift() ?? result([])) as QueryResult
    },
    release() {},
  }
  const withActor: WithActor = async (passedActor, callback) => {
    receivedActor = passedActor
    return callback(client)
  }
  return {withActor, queries, actor: () => receivedActor}
}

describe('chat repository', () => {
  it('lists owner-scoped conversations with contract cursors and no provider ids', async () => {
    const fake = fakeWithActor([result([conversationRow(), conversationRow({id: '00000000-0000-4000-8000-000000000009', updated_at: now})]),])
    const page = await createChatRepository(fake.withActor).listConversations(actor, {limit: 1, sendEnabled: true})

    expect(fake.actor()).toEqual(actor)
    expect(fake.queries[0]?.text).toContain('FROM public.chat_conversations conversation')
    expect(fake.queries[0]?.values).toEqual([null, null, 2])
    expect(page.items[0]).toEqual({
      id: conversationId, ipProfile: {id: ipProfileId, username: 'sage_ip', displayName: 'Sage'},
      lastMessage: {body: 'Newest', role: 'assistant', createdAt: later}, updatedAt: later, sendEnabled: true,
    })
    expect(JSON.stringify(page)).not.toContain('provider-')
    expect(decodeChatConversationCursor(page.nextCursor!)).toEqual({v: 1, kind: 'chat-conversations', updatedAt: later, id: conversationId})
  })

  it('maps a conversation cursor into the strict updated-at query tuple', async () => {
    const fake = fakeWithActor([result([])])
    const cursor = 'eyJ2IjoxLCJraW5kIjoiY2hhdC1jb252ZXJzYXRpb25zIiwidXBkYXRlZEF0IjoiMjAyNi0wOS0wMVQwMDowMDowMC4wMDBaIiwiaWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDcifQ'
    await createChatRepository(fake.withActor).listConversations(actor, {limit: 5, cursor, sendEnabled: false})
    expect(fake.queries[0]?.values).toEqual(['2026-09-01T00:00:00.000Z', '00000000-0000-4000-8000-000000000007', 6])
    expect(fake.queries[0]?.text).toContain('(conversation.updated_at, conversation.id) <')
  })

  it('preserves six-digit UTC cursor precision and sends the exact timestamp back to PostgreSQL', async () => {
    const firstConversationTime = '2026-09-02T00:00:00.000900Z'
    const secondConversationTime = '2026-09-02T00:00:00.000100Z'
    const oldestMessageTime = '2026-09-02T00:00:00.000100Z'
    const fake = fakeWithActor([
      result([conversationRow({updated_at: firstConversationTime}), conversationRow({id: '00000000-0000-4000-8000-000000000009', updated_at: secondConversationTime})]),
      result([]),
      result([conversationRow()]),
      result([
        messageRow({id: assistantMessageId, role: 'assistant', body: 'Newest', delivery_state: 'sent', created_at: '2026-09-02T00:00:00.000900Z'}),
        messageRow({id: humanMessageId, created_at: oldestMessageTime}),
        messageRow({id: '00000000-0000-4000-8000-000000000008', created_at: '2026-09-02T00:00:00.000001Z'}),
      ]),
      result([conversationRow()]),
      result([]),
    ])
    const repository = createChatRepository(fake.withActor)
    const conversations = await repository.listConversations(actor, {limit: 1, sendEnabled: true})
    expect(decodeChatConversationCursor(conversations.nextCursor!)).toMatchObject({updatedAt: firstConversationTime})
    await repository.listConversations(actor, {limit: 1, cursor: conversations.nextCursor!, sendEnabled: true})
    expect(fake.queries[1]?.values).toEqual([firstConversationTime, conversationId, 2])
    expect(fake.queries[0]?.text).toContain(`to_char(conversation.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`)

    const history = await repository.listMessages(actor, {conversationId, limit: 2, sendEnabled: true})
    expect(decodeChatMessageCursor(history!.nextCursor!)).toMatchObject({createdAt: oldestMessageTime})
    await repository.listMessages(actor, {conversationId, limit: 2, cursor: history!.nextCursor!, sendEnabled: true})
    expect(fake.queries[5]?.values).toEqual([conversationId, oldestMessageTime, humanMessageId, 3])
    expect(fake.queries[3]?.text).toContain(`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`)
  })

  it('inserts once then selects the owner-scoped pair after a get-or-create race', async () => {
    const fake = fakeWithActor([result([]), result([conversationRow()])])
    const item = await createChatRepository(fake.withActor).getOrCreateConversation(actor, {humanProfileId, ipProfileId, sendEnabled: false})
    expect(fake.actor()).toEqual(actor)
    expect(fake.queries.map((query) => query.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('ON CONFLICT (human_profile_id, ip_profile_id) DO NOTHING'),
      expect.stringContaining('WHERE conversation.human_profile_id = $1::uuid AND conversation.ip_profile_id = $2::uuid'),
    ]))
    expect(fake.queries[0]?.values).toEqual([humanProfileId, ipProfileId])
    expect(item?.sendEnabled).toBe(false)
  })

  it('returns chronological history and anchors its next cursor to the oldest fetched message', async () => {
    const oldest = messageRow({id: humanMessageId, created_at: now, provider_message_id: undefined})
    const newest = messageRow({id: assistantMessageId, role: 'assistant', body: 'Reply', delivery_state: 'sent', created_at: later, provider_message_id: undefined})
    const olderExtra = messageRow({id: '00000000-0000-4000-8000-000000000008', created_at: '2026-09-01T00:00:00.000Z', provider_message_id: undefined})
    const fake = fakeWithActor([result([conversationRow()]), result([newest, oldest, olderExtra])])
    const page = await createChatRepository(fake.withActor).listMessages(actor, {conversationId, limit: 2, sendEnabled: true})
    expect(page?.items.map((item) => item.id)).toEqual([humanMessageId, assistantMessageId])
    expect(decodeChatMessageCursor(page!.nextCursor!)).toEqual({v: 1, kind: 'chat-messages', createdAt: now, id: humanMessageId})
    expect(fake.queries[1]?.values).toEqual([conversationId, null, null, 3])
    expect(JSON.stringify(page)).not.toContain('provider-')
  })

  it.each([
    ['new insert', [result([{id: humanMessageId}]), result([messageRow()]), result([])], 'ready'],
    ['pending replay', [result([]), result([messageRow()])], 'inflight'],
    ['failed retry', [result([]), result([messageRow({delivery_state: 'failed'})]), result([messageRow()]), result([])], 'ready'],
    ['sent replay', [result([]), result([messageRow({delivery_state: 'sent'})]), result([messageRow({id: assistantMessageId, role: 'assistant', body: 'Reply', delivery_state: 'sent'})])], 'complete'],
    ['body conflict', [result([]), result([messageRow({body: 'Different'})])], 'conflict'],
    ['inaccessible conversation', [result([]), result([])], null],
  ] as const)('begins a %s request idempotently', async (_name, responses, expectedType) => {
    const fake = fakeWithActor([...responses])
    const outcome = await createChatRepository(fake.withActor).beginHumanMessage(actor, {conversationId, requestId, body: 'Hello'})
    expect(fake.actor()).toEqual(actor)
    expect(fake.queries[0]?.text).toContain('ON CONFLICT (conversation_id, client_request_id) DO NOTHING')
    expect(fake.queries.some((query) => query.text.includes(expectedType === 'complete' ? 'in_reply_to_client_request_id' : expectedType === 'ready' && _name === 'failed retry' ? "SET delivery_state = 'pending'" : 'FOR UPDATE'))).toBe(true)
    expect(outcome?.type ?? null).toBe(expectedType)
    expect(JSON.stringify(outcome)).not.toContain('provider-message-secret')
    const conversationTouches = fake.queries.filter((query) => query.text.includes('UPDATE public.chat_conversations SET updated_at = clock_timestamp() WHERE id = $1::uuid'))
    if (_name === 'new insert' || _name === 'failed retry') {
      expect(conversationTouches).toHaveLength(1)
      expect(conversationTouches[0]?.values).toEqual([conversationId])
    } else {
      expect(conversationTouches).toHaveLength(0)
    }
  })

  it('completes a pending human message atomically and preserves provider ids internally only', async () => {
    const sentHuman = messageRow({delivery_state: 'sent', provider_message_id: undefined})
    const sentAssistant = messageRow({id: assistantMessageId, role: 'assistant', body: 'Reply', delivery_state: 'sent', provider_message_id: undefined})
    const fake = fakeWithActor([result([messageRow()]), result([sentHuman]), result([sentAssistant]), result([conversationRow()])])
    const response = await createChatRepository(fake.withActor).completeProviderReply(actor, {
      conversationId, humanMessageId, answer: 'Reply', providerConversationId: 'provider-conversation-secret', providerMessageId: 'provider-message-secret',
    })
    expect(fake.actor()).toEqual(actor)
    expect(fake.queries.map((query) => query.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('FOR UPDATE OF message, conversation'),
      expect.stringContaining("SET delivery_state = 'sent'"),
      expect.stringContaining('ON CONFLICT (conversation_id, in_reply_to_client_request_id) DO NOTHING'),
      expect.stringContaining('SET provider_conversation_id = $1'),
    ]))
    expect(response).toEqual({
      humanMessage: {id: humanMessageId, role: 'human', body: 'Hello', deliveryState: 'sent', createdAt: now},
      assistantMessage: {id: assistantMessageId, role: 'assistant', body: 'Reply', deliveryState: 'sent', createdAt: now},
    })
    expect(JSON.stringify(response)).not.toContain('provider-')
  })

  it('fails only a pending human message in the owner conversation', async () => {
    const fake = fakeWithActor([result([{id: humanMessageId}])])
    await expect(createChatRepository(fake.withActor).failHumanMessage(actor, {conversationId, humanMessageId})).resolves.toBe(true)
    expect(fake.actor()).toEqual(actor)
    expect(fake.queries[0]?.text).toContain("role = 'human' AND delivery_state = 'pending'")
    expect(fake.queries[0]?.values).toEqual([humanMessageId, conversationId])
  })
})

type IntegrationHuman = {id: string; subject: string}
async function inIntegrationTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await integrationPool.connect()
  try {
    await client.query('BEGIN')
    return await callback(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}
async function createIntegrationHuman(client: PoolClient): Promise<IntegrationHuman> {
  const id = randomUUID()
  const subject = `chat-cursor-${id}`
  await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Chat cursor human')", [id, subject, `chat_cursor_h_${id.replaceAll('-', '').slice(0, 18)}`])
  return {id, subject}
}
async function createIntegrationIp(client: PoolClient): Promise<string> {
  const id = randomUUID()
  const revisionId = randomUUID()
  await client.query("INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'Chat cursor IP')", [id, `chat_cursor_i_${id.replaceAll('-', '').slice(0, 18)}`])
  await client.query("INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled) VALUES($1,'platform','draft',false)", [id])
  await client.query("INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'Chat cursor IP',ARRAY['en'])", [revisionId, id])
  await client.query("UPDATE public.ip_profiles SET current_identity_revision_id=$2,public_state='published',operation_enabled=true WHERE profile_id=$1", [id, revisionId])
  return id
}

describeIntegration('chat repository cursor integration', () => {
  afterAll(async () => integrationPool.end())

  it('does not skip or duplicate messages whose timestamps differ only below a millisecond', async () => {
    await inIntegrationTransaction(async (client) => {
      const human = await createIntegrationHuman(client)
      const ip = await createIntegrationIp(client)
      const transactionPool = {connect: async () => ({query: client.query.bind(client), release() {}})}
      const repository = createChatRepository(createActorSession(transactionPool, {transactionMode: 'nested'}).withActor)
      const conversation = await repository.getOrCreateConversation({subject: human.subject}, {humanProfileId: human.id, ipProfileId: ip, sendEnabled: true})
      expect(conversation).not.toBeNull()
      await client.query("SET LOCAL ROLE aifans_authenticated")
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({sub: human.subject})])
      const ids = [randomUUID(), randomUUID(), randomUUID()]
      for (const [index, createdAt] of ['2026-09-02T00:00:00.000001Z', '2026-09-02T00:00:00.000100Z', '2026-09-02T00:00:00.000900Z'].entries()) {
        await client.query("INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id,created_at) VALUES($1,$2,'human',$3,'pending',$4,$5)", [ids[index], conversation!.id, `message-${index}`, randomUUID(), createdAt])
      }
      const first = await repository.listMessages({subject: human.subject}, {conversationId: conversation!.id, limit: 2, sendEnabled: true})
      const second = await repository.listMessages({subject: human.subject}, {conversationId: conversation!.id, limit: 2, cursor: first!.nextCursor!, sendEnabled: true})
      expect(first?.nextCursor).toBeTruthy()
      expect([...first!.items, ...second!.items].map((item) => item.id).sort()).toEqual(ids.slice().sort())
      expect(new Set([...first!.items, ...second!.items].map((item) => item.id))).toHaveLength(3)
    })
  })
})
