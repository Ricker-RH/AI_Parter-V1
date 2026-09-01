import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const migrationPath = resolve(import.meta.dirname, '../migrations/202609020002_persistent_chat.sql')
const connectionString = process.env.DATABASE_URL ?? ''
const describeIntegration = connectionString ? describe : describe.skip
const pool = new Pool({ connectionString })

type Human = { id: string; subject: string }

async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    return await callback(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

async function createHuman(client: PoolClient): Promise<Human> {
  const id = randomUUID()
  const subject = `chat-${id}`
  await client.query(
    "INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Chat human')",
    [id, subject, `chat_h_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  return { id, subject }
}

async function createIp(client: PoolClient, published: boolean): Promise<string> {
  const id = randomUUID()
  const revisionId = randomUUID()
  await client.query(
    "INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'Chat IP')",
    [id, `chat_i_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  await client.query(
    "INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled) VALUES($1,'platform','draft',false)",
    [id],
  )
  await client.query(
    "INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'Chat IP',ARRAY['en'])",
    [revisionId, id],
  )
  await client.query(
    'UPDATE public.ip_profiles SET current_identity_revision_id=$2,public_state=$3,operation_enabled=$4 WHERE profile_id=$1',
    [id, revisionId, published ? 'published' : 'draft', published],
  )
  return id
}

async function become(client: PoolClient, role: 'aifans_anon' | 'aifans_authenticated', subject?: string): Promise<void> {
  await client.query(`SET LOCAL ROLE ${role}`)
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(subject ? { sub: subject } : {})])
}

async function insertConversation(client: PoolClient, humanProfileId: string, ipProfileId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    'INSERT INTO public.chat_conversations(human_profile_id,ip_profile_id) VALUES($1,$2) RETURNING id',
    [humanProfileId, ipProfileId],
  )
  return result.rows[0]!.id
}

async function rejected<T>(client: PoolClient, query: () => Promise<T>): Promise<unknown> {
  await client.query('SAVEPOINT expected_failure')
  try {
    await query()
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure')
    await client.query('RELEASE SAVEPOINT expected_failure')
    return error
  }
  await client.query('ROLLBACK TO SAVEPOINT expected_failure')
  await client.query('RELEASE SAVEPOINT expected_failure')
  throw new Error('Expected query to fail')
}

describe('persistent chat migration static coverage', () => {
  it('declares bounded chat storage, idempotent assistant linkage, force-RLS, and no public grants', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/CREATE TYPE public\.chat_message_role AS ENUM \('human', 'assistant'\)/)
    expect(sql).toMatch(/CREATE TYPE public\.chat_delivery_state AS ENUM \('pending', 'sent', 'failed'\)/)
    expect(sql).toMatch(/CREATE TABLE public\.chat_conversations/)
    expect(sql).toMatch(/provider_conversation_id text[\s\S]*char_length\(provider_conversation_id\) BETWEEN 1 AND 512/)
    expect(sql).toMatch(/CREATE TABLE public\.chat_messages/)
    expect(sql).toMatch(/chat_messages_body_length_check CHECK \(char_length\(body\) BETWEEN 1 AND 4000\)/)
    expect(sql).toMatch(/CREATE FUNCTION public\.guard_chat_conversation_update\(\)[\s\S]*provider_conversation_id is write-once/)
    expect(sql).toMatch(/CREATE FUNCTION public\.guard_chat_message_update\(\)[\s\S]*invalid chat message delivery transition/)
    expect(sql).toMatch(/OLD\.delivery_state = 'pending' AND NEW\.delivery_state IN \('sent', 'failed'\)/)
    expect(sql).toMatch(/OLD\.delivery_state = 'failed' AND NEW\.delivery_state = 'pending'/)
    expect(sql).toMatch(/provider_message_id is write-once/)
    expect(sql).toMatch(/provider_message_id text[\s\S]*char_length\(provider_message_id\) BETWEEN 1 AND 512/)
    expect(sql).toMatch(/FOREIGN KEY \(conversation_id, in_reply_to_client_request_id\)[\s\S]*REFERENCES public\.chat_messages \(conversation_id, client_request_id\)/)
    expect(sql).toMatch(/UNIQUE \(conversation_id, in_reply_to_client_request_id\)/)
    expect(sql).toMatch(/chat_messages_role_request_link_check[\s\S]*role = 'human'[\s\S]*client_request_id IS NOT NULL[\s\S]*role = 'assistant'[\s\S]*in_reply_to_client_request_id IS NOT NULL/)
    expect(sql).toMatch(/role = 'assistant' AND client_request_id IS NULL AND in_reply_to_client_request_id IS NOT NULL AND delivery_state = 'sent'/)
    expect(sql).toMatch(/chat_conversations_owner_updated_cursor_idx\s+ON public\.chat_conversations \(human_profile_id, updated_at DESC, id DESC\)/)
    expect(sql).toMatch(/chat_messages_conversation_created_cursor_idx\s+ON public\.chat_messages \(conversation_id, created_at DESC, id DESC\)/)
    expect(sql.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(2)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.chat_conversations, public\.chat_messages FROM PUBLIC, aifans_anon, aifans_authenticated/)
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.chat_conversations, public\.chat_messages TO aifans_authenticated/)
    expect(sql).toMatch(/GRANT UPDATE \(provider_conversation_id, updated_at\) ON public\.chat_conversations TO aifans_authenticated/)
    expect(sql).toMatch(/GRANT UPDATE \(delivery_state, provider_message_id\) ON public\.chat_messages TO aifans_authenticated/)
    expect(sql).not.toMatch(/GRANT .* TO (?:PUBLIC|aifans_anon)/)
  })
})

describeIntegration('persistent chat authorization and constraints', () => {
  afterAll(async () => pool.end())

  it('keeps conversations and messages private to their human owner and denies anonymous access', async () => {
    await transaction(async (client) => {
      const ownerA = await createHuman(client)
      const ownerB = await createHuman(client)
      const ip = await createIp(client, true)

      await become(client, 'aifans_authenticated', ownerB.subject)
      const conversationB = await insertConversation(client, ownerB.id, ip)
      await client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id) VALUES($1,$2,'human','Hello','pending',$3)",
        [randomUUID(), conversationB, randomUUID()],
      )

      await become(client, 'aifans_authenticated', ownerA.subject)
      await expect(client.query('SELECT id FROM public.chat_conversations WHERE id=$1', [conversationB]))
        .resolves.toMatchObject({ rowCount: 0 })
      await expect(client.query("UPDATE public.chat_conversations SET updated_at=now() WHERE id=$1", [conversationB]))
        .resolves.toMatchObject({ rowCount: 0 })
      await expect(client.query('SELECT id FROM public.chat_messages WHERE conversation_id=$1', [conversationB]))
        .resolves.toMatchObject({ rowCount: 0 })

      await become(client, 'aifans_anon')
      await expect(client.query('SELECT id FROM public.chat_conversations')).rejects.toThrow(/permission denied/i)
      await expect(client.query('SELECT id FROM public.chat_messages')).rejects.toThrow(/permission denied/i)
    })
  })

  it('accepts an authenticated human only for a published public chat IP and its own profile', async () => {
    await transaction(async (client) => {
      const owner = await createHuman(client)
      const other = await createHuman(client)
      const publishedIp = await createIp(client, true)
      const unpublishedIp = await createIp(client, false)

      await become(client, 'aifans_authenticated', owner.subject)
      await expect(insertConversation(client, owner.id, publishedIp)).resolves.toMatch(/^[0-9a-f-]{36}$/)
      const unpublishedTarget = await rejected(client, () => insertConversation(client, owner.id, unpublishedIp))
      expect(unpublishedTarget).toBeInstanceOf(Error)
      expect((unpublishedTarget as Error).message).toMatch(/row-level security/i)
      const mismatchedActor = await rejected(client, () => insertConversation(client, other.id, publishedIp))
      expect(mismatchedActor).toBeInstanceOf(Error)
      expect((mismatchedActor as Error).message).toMatch(/row-level security/i)
    })
  })

  it('rejects duplicate conversation pairs, duplicate human requests, duplicate assistant completions, and overlong provider ids', async () => {
    await transaction(async (client) => {
      const owner = await createHuman(client)
      const ip = await createIp(client, true)

      await become(client, 'aifans_authenticated', owner.subject)
      const conversation = await insertConversation(client, owner.id, ip)
      await expect(rejected(client, () => insertConversation(client, owner.id, ip))).resolves.toMatchObject({ code: '23505' })

      const requestId = randomUUID()
      await client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id) VALUES($1,$2,'human','First','pending',$3)",
        [randomUUID(), conversation, requestId],
      )
      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id) VALUES($1,$2,'human','Duplicate','pending',$3)",
        [randomUUID(), conversation, requestId],
      ))).resolves.toMatchObject({ code: '23505' })
      await client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id,provider_message_id) VALUES($1,$2,'assistant','Reply','sent',$3,$4)",
        [randomUUID(), conversation, requestId, 'x'],
      )
      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id) VALUES($1,$2,'assistant','Duplicate reply','sent',$3)",
        [randomUUID(), conversation, requestId],
      ))).resolves.toMatchObject({ code: '23505' })

      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_conversations(human_profile_id,ip_profile_id,provider_conversation_id) VALUES($1,$2,$3)",
        [owner.id, ip, 'x'.repeat(513)],
      ))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id,provider_message_id) VALUES($1,$2,'human','Length','pending',$3,$4)",
        [randomUUID(), conversation, randomUUID(), 'x'.repeat(513)],
      ))).resolves.toMatchObject({ code: '23514' })
    })
  })

  it('enforces chat body and provider identifier bounds without role-link confounders', async () => {
    await transaction(async (client) => {
      const owner = await createHuman(client)
      const firstIp = await createIp(client, true)
      const secondIp = await createIp(client, true)
      const thirdIp = await createIp(client, true)

      await become(client, 'aifans_authenticated', owner.subject)
      const conversation = await insertConversation(client, owner.id, firstIp)
      const providerOneConversation = await insertConversation(client, owner.id, secondIp)
      const providerMaxConversation = await insertConversation(client, owner.id, thirdIp)
      await expect(client.query(
        "UPDATE public.chat_conversations SET provider_conversation_id=$1 WHERE id=$2",
        ['x', providerOneConversation],
      )).resolves.toMatchObject({ rowCount: 1 })
      await expect(client.query(
        "UPDATE public.chat_conversations SET provider_conversation_id=$1 WHERE id=$2",
        ['x'.repeat(512), providerMaxConversation],
      )).resolves.toMatchObject({ rowCount: 1 })
      await expect(rejected(client, () => client.query(
        "UPDATE public.chat_conversations SET provider_conversation_id='' WHERE id=$1",
        [providerOneConversation],
      ))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => client.query(
        "UPDATE public.chat_conversations SET provider_conversation_id=$1 WHERE id=$2",
        ['x'.repeat(513), providerOneConversation],
      ))).resolves.toMatchObject({ code: '23514' })

      const request = async (body: string) => {
        const clientRequestId = randomUUID()
        await client.query(
          "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id) VALUES($1,$2,'human',$3,'pending',$4)",
          [randomUUID(), conversation, body, clientRequestId],
        )
        return clientRequestId
      }
      const oneCharacterRequest = await request('x')
      await expect(request('x'.repeat(4000))).resolves.toMatch(/^[0-9a-f-]{36}$/)
      await expect(rejected(client, () => request(''))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => request('x'.repeat(4001)))).resolves.toMatchObject({ code: '23514' })

      await expect(client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id,provider_message_id) VALUES($1,$2,'assistant','Reply','sent',$3,$4)",
        [randomUUID(), conversation, oneCharacterRequest, 'x'],
      )).resolves.toMatchObject({ rowCount: 1 })
      const maxProviderRequest = await request('Max provider')
      await expect(client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id,provider_message_id) VALUES($1,$2,'assistant','Reply','sent',$3,$4)",
        [randomUUID(), conversation, maxProviderRequest, 'x'.repeat(512)],
      )).resolves.toMatchObject({ rowCount: 1 })
      const emptyProviderRequest = await request('Empty provider')
      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id,provider_message_id) VALUES($1,$2,'assistant','Reply','sent',$3,'')",
        [randomUUID(), conversation, emptyProviderRequest],
      ))).resolves.toMatchObject({ code: '23514' })
      const overlongProviderRequest = await request('Overlong provider')
      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id,provider_message_id) VALUES($1,$2,'assistant','Reply','sent',$3,$4)",
        [randomUUID(), conversation, overlongProviderRequest, 'x'.repeat(513)],
      ))).resolves.toMatchObject({ code: '23514' })
    })
  })

  it('permits only recoverable delivery transitions and write-once provider identifiers', async () => {
    await transaction(async (client) => {
      const owner = await createHuman(client)
      const ip = await createIp(client, true)

      await become(client, 'aifans_authenticated', owner.subject)
      const conversation = await insertConversation(client, owner.id, ip)
      await expect(client.query(
        "UPDATE public.chat_conversations SET provider_conversation_id='provider-conversation' WHERE id=$1",
        [conversation],
      )).resolves.toMatchObject({ rowCount: 1 })
      await expect(rejected(client, () => client.query(
        "UPDATE public.chat_conversations SET provider_conversation_id='different-provider-conversation' WHERE id=$1",
        [conversation],
      ))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => client.query(
        'UPDATE public.chat_conversations SET provider_conversation_id=NULL WHERE id=$1',
        [conversation],
      ))).resolves.toMatchObject({ code: '23514' })

      const sentMessageId = randomUUID()
      await client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id) VALUES($1,$2,'human','Pending','pending',$3)",
        [sentMessageId, conversation, randomUUID()],
      )
      await expect(client.query(
        "UPDATE public.chat_messages SET delivery_state='sent' WHERE id=$1",
        [sentMessageId],
      )).resolves.toMatchObject({ rowCount: 1 })
      await expect(rejected(client, () => client.query(
        "UPDATE public.chat_messages SET delivery_state='pending' WHERE id=$1",
        [sentMessageId],
      ))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => client.query(
        "UPDATE public.chat_messages SET delivery_state='failed' WHERE id=$1",
        [sentMessageId],
      ))).resolves.toMatchObject({ code: '23514' })

      const retryMessageId = randomUUID()
      await client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id) VALUES($1,$2,'human','Retry','pending',$3)",
        [retryMessageId, conversation, randomUUID()],
      )
      await client.query("UPDATE public.chat_messages SET delivery_state='failed' WHERE id=$1", [retryMessageId])
      await expect(client.query("UPDATE public.chat_messages SET delivery_state='pending' WHERE id=$1", [retryMessageId]))
        .resolves.toMatchObject({ rowCount: 1 })

      const requestId = randomUUID()
      await client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,client_request_id) VALUES($1,$2,'human','Provider request','pending',$3)",
        [randomUUID(), conversation, requestId],
      )
      const assistantMessageId = randomUUID()
      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id) VALUES($1,$2,'assistant','Pending assistant','pending',$3)",
        [randomUUID(), conversation, requestId],
      ))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id) VALUES($1,$2,'assistant','Failed assistant','failed',$3)",
        [randomUUID(), conversation, requestId],
      ))).resolves.toMatchObject({ code: '23514' })
      await client.query(
        "INSERT INTO public.chat_messages(id,conversation_id,role,body,delivery_state,in_reply_to_client_request_id) VALUES($1,$2,'assistant','Provider reply','sent',$3)",
        [assistantMessageId, conversation, requestId],
      )
      await expect(client.query(
        "UPDATE public.chat_messages SET provider_message_id='provider-message' WHERE id=$1",
        [assistantMessageId],
      )).resolves.toMatchObject({ rowCount: 1 })
      await expect(rejected(client, () => client.query(
        "UPDATE public.chat_messages SET provider_message_id='different-provider-message' WHERE id=$1",
        [assistantMessageId],
      ))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => client.query(
        'UPDATE public.chat_messages SET provider_message_id=NULL WHERE id=$1',
        [assistantMessageId],
      ))).resolves.toMatchObject({ code: '23514' })
      await expect(rejected(client, () => client.query(
        "UPDATE public.chat_messages SET delivery_state='failed' WHERE id=$1",
        [assistantMessageId],
      ))).resolves.toMatchObject({ code: '23514' })
    })
  })
})
