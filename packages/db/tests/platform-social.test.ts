import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'
import {createPlatformSession, withPlatformActor} from '../src/session.js'
import {createPlatformSocialRepository, createSocialRepository} from '../src/social.js'

const connectionString = process.env.DATABASE_URL ?? ''
const integration = connectionString ? describe : describe.skip
const pool = new Pool({connectionString})

describe('platform database configuration', () => {
  it('requires DATABASE_PLATFORM_URL and never falls back to an owner URL', async () => {
    const previous = process.env.DATABASE_PLATFORM_URL
    delete process.env.DATABASE_PLATFORM_URL
    try {
      await expect(withPlatformActor({subject: 'operator'}, async () => undefined)).rejects.toThrow('DATABASE_PLATFORM_URL must be a valid postgres URL')
    } finally {
      if (previous === undefined) delete process.env.DATABASE_PLATFORM_URL
      else process.env.DATABASE_PLATFORM_URL = previous
    }
  })
})

async function tx<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    return await callback(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

async function human(client: PoolClient, operator = false) {
  const id = randomUUID()
  const subject = `platform-${randomUUID()}`
  await client.query(
    `INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name)
     VALUES($1,$2,'human',$3,'Platform human')`,
    [id, subject, `h_${id.replaceAll('-', '').slice(0, 20)}`],
  )
  if (operator) {
    await client.query(
      `INSERT INTO public.profile_roles(profile_id,role,granted_by_profile_id)
       VALUES($1,'operator',$1)`,
      [id],
    )
  }
  return {id, subject}
}

function repositories(client: PoolClient) {
  const queryClient = {query: client.query.bind(client), release() {}}
  const platformSession = createPlatformSession({connect: async () => queryClient})
  return {
    platform: createPlatformSocialRepository({withPlatformActor: platformSession.withPlatformActor}),
    public: createSocialRepository({
      withPublic: async (callback) => {
        await client.query('SAVEPOINT public_read')
        try {
          await client.query('SET LOCAL ROLE aifans_anon')
          return await callback(queryClient)
        } finally {
          await client.query('ROLLBACK TO SAVEPOINT public_read').catch(() => undefined)
          await client.query('RELEASE SAVEPOINT public_read').catch(() => undefined)
        }
      },
    }),
  }
}

integration('platform social repository', () => {
  afterAll(async () => pool.end())

  it('rejects a non-operator and permits an active human operator', async () => tx(async (client) => {
    const ordinary = await human(client)
    const operator = await human(client, true)
    const {platform} = repositories(client)

    await expect(platform.createIp({actor: ordinary, requestId: randomUUID(), ip: {username: `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`, displayName: 'No'}})).rejects.toMatchObject({code: '42501'})
    const created = await platform.createIp({actor: operator, requestId: randomUUID(), ip: {username: `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`, displayName: 'Public IP', bio: 'Public bio', languageCodes: ['en']}})
    expect(created).toMatchObject({kind: 'ip', displayName: 'Public IP', bio: 'Public bio', languages: ['en']})
    expect(created).not.toHaveProperty('operatorProfileId')
    expect(created).not.toHaveProperty('authSubject')
    const identity = await client.query(`SELECT ip.current_identity_revision_id,r.id revision_id,r.version,r.created_by_profile_id,ip.public_state,ip.operation_enabled FROM public.ip_profiles ip JOIN public.ip_identity_revisions r ON r.ip_profile_id=ip.profile_id WHERE ip.profile_id=$1`, [created.id])
    expect(identity.rows).toEqual([{current_identity_revision_id: identity.rows[0]?.revision_id, revision_id: identity.rows[0]?.revision_id, version: 1, created_by_profile_id: operator.id, public_state: 'published', operation_enabled: true}])

    await client.query("UPDATE public.profile_roles SET revoked_at=clock_timestamp() WHERE profile_id=$1 AND role='operator'", [operator.id])
    await expect(platform.createIp({actor: operator, requestId: randomUUID(), ip: {username: `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`, displayName: 'Revoked'}})).rejects.toMatchObject({code: '42501'})
  }))

  it('publishes attributed text-only posts and IP comments into public projections', async () => tx(async (client) => {
    const operator = await human(client, true)
    const {platform, public: social} = repositories(client)
    const ip = await platform.createIp({actor: operator, requestId: randomUUID(), ip: {username: `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`, displayName: 'Author', languageCodes: ['zh-CN']}})
    const published = await platform.publishPost({actor: operator, requestId: randomUUID(), post: {ipProfileId: ip.id, body: 'Text only', languageCode: 'zh-CN'}})
    expect(published).toMatchObject({body: 'Text only', author: {id: ip.id}, likeCount: 0, commentCount: 0})
    expect(published).not.toHaveProperty('actingOperatorProfileId')
    const feed = await social.listFeed({viewer: null, kind: 'for_you', limit: 25, after: null})
    expect(feed.items.map((item) => item.id)).toContain(published.id)
    await expect(client.query('SELECT 1 FROM public.post_media WHERE post_id=$1', [published.id])).resolves.toMatchObject({rowCount: 0})

    const comment = await platform.publishIpComment({actor: operator, requestId: randomUUID(), postId: published.id, comment: {ipProfileId: ip.id, body: 'IP comment'}})
    const reply = await platform.publishIpComment({actor: operator, requestId: randomUUID(), postId: published.id, comment: {ipProfileId: ip.id, body: 'IP reply', parentCommentId: comment.id}})
    expect(comment).toMatchObject({postId: published.id, author: {kind: 'ip', id: ip.id}, body: 'IP comment'})
    expect(reply).toMatchObject({parentCommentId: comment.id, author: {id: ip.id}})

    const raw = await client.query(`SELECT p.source post_source,p.acting_operator_profile_id post_operator,c.source comment_source,c.acting_operator_profile_id comment_operator FROM public.posts p JOIN public.comments c ON c.post_id=p.id WHERE p.id=$1`, [published.id])
    expect(raw.rows[0]).toMatchObject({post_source: 'admin', post_operator: operator.id, comment_source: 'admin', comment_operator: operator.id})
    const history = await client.query(`SELECT a.actor_profile_id,a.source_app,a.change_summary,e.environment,e.properties,o.payload,w.previous_state,w.next_state FROM public.audit_events a JOIN public.business_events e ON e.subject_entity_id=a.entity_id JOIN public.analytics_outbox o ON o.business_event_id=e.id JOIN public.workflow_transitions w ON w.entity_id=a.entity_id WHERE a.action='post_published' AND a.entity_id=$1`, [published.id])
    expect(history.rows[0]).toMatchObject({actor_profile_id: operator.id, source_app: 'admin', change_summary: {source: 'admin', represented_ip_profile_id: ip.id}, environment: 'admin', properties: {request_id: expect.any(String), ip_profile_id: ip.id, action_source: 'admin'}, payload: {event_name: 'post_published', event_version: 1, request_id: expect.any(String), ip_profile_id: ip.id, action_source: 'admin'}, previous_state: 'draft', next_state: 'published'})
    expect(JSON.stringify(history.rows[0])).not.toContain('Text only')
    expect(JSON.stringify(history.rows[0])).not.toContain('IP comment')
  }))

  it('rejects invalid IP state, post state, cross-post parents, and replies deeper than one level', async () => tx(async (client) => {
    const operator = await human(client, true)
    const {platform} = repositories(client)
    const first = await platform.createIp({actor: operator, requestId: randomUUID(), ip: {username: `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`, displayName: 'First'}})
    const second = await platform.createIp({actor: operator, requestId: randomUUID(), ip: {username: `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`, displayName: 'Second'}})
    const firstPost = await platform.publishPost({actor: operator, requestId: randomUUID(), post: {ipProfileId: first.id, body: 'First post'}})
    const secondPost = await platform.publishPost({actor: operator, requestId: randomUUID(), post: {ipProfileId: second.id, body: 'Second post'}})
    const root = await platform.publishIpComment({actor: operator, requestId: randomUUID(), postId: firstPost.id, comment: {ipProfileId: second.id, body: 'Root'}})
    const reply = await platform.publishIpComment({actor: operator, requestId: randomUUID(), postId: firstPost.id, comment: {ipProfileId: second.id, body: 'Reply', parentCommentId: root.id}})

    await client.query("UPDATE public.ip_profiles SET public_state='paused' WHERE profile_id=$1", [second.id])
    await expect(platform.publishPost({actor: operator, requestId: randomUUID(), post: {ipProfileId: second.id, body: 'No'}})).rejects.toMatchObject({code: 'P0001'})
    await client.query("UPDATE public.ip_profiles SET public_state='published' WHERE profile_id=$1", [second.id])
    await expect(platform.publishIpComment({actor: operator, requestId: randomUUID(), postId: secondPost.id, comment: {ipProfileId: second.id, body: 'Wrong post', parentCommentId: root.id}})).rejects.toMatchObject({code: '23514'})
    await expect(platform.publishIpComment({actor: operator, requestId: randomUUID(), postId: firstPost.id, comment: {ipProfileId: second.id, body: 'Too deep', parentCommentId: reply.id}})).rejects.toMatchObject({code: '23514'})
    await client.query("UPDATE public.posts SET state='withdrawn',withdrawn_at=clock_timestamp() WHERE id=$1", [firstPost.id])
    await expect(platform.publishIpComment({actor: operator, requestId: randomUUID(), postId: firstPost.id, comment: {ipProfileId: first.id, body: 'Hidden'}})).rejects.toMatchObject({code: 'P0002'})
  }))

  it('atomically rolls back visible rows when history or outbox insertion fails', async () => tx(async (client) => {
    const operator = await human(client, true)
    const {platform} = repositories(client)
    const ip = await platform.createIp({actor: operator, requestId: randomUUID(), ip: {username: `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`, displayName: 'Rollback'}})
    await client.query(`CREATE FUNCTION pg_temp.reject_platform_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced platform outbox failure'; END $$`)
    await client.query(`CREATE TRIGGER reject_platform_outbox BEFORE INSERT ON public.analytics_outbox FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_platform_outbox()`)
    await expect(platform.publishPost({actor: operator, requestId: randomUUID(), post: {ipProfileId: ip.id, body: 'Must roll back'}})).rejects.toThrow('forced platform outbox failure')
    await expect(client.query("SELECT 1 FROM public.posts WHERE author_profile_id=$1 AND body='Must roll back'", [ip.id])).resolves.toMatchObject({rowCount: 0})
  }))

  it('rolls back an IP when audit history insertion fails', async () => tx(async (client) => {
    const operator = await human(client, true)
    const {platform} = repositories(client)
    const username = `ip_${randomUUID().replaceAll('-', '').slice(0, 20)}`
    await client.query(`CREATE FUNCTION pg_temp.reject_platform_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced platform audit failure'; END $$`)
    await client.query(`CREATE TRIGGER reject_platform_audit BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_platform_audit()`)
    await expect(platform.createIp({actor: operator, requestId: randomUUID(), ip: {username, displayName: 'Must roll back'}})).rejects.toThrow('forced platform audit failure')
    await expect(client.query('SELECT 1 FROM public.profiles WHERE username=$1', [username])).resolves.toMatchObject({rowCount: 0})
  }))

  it('grants only bounded function execution and forbids platform-role table writes', async () => tx(async (client) => {
    await client.query('SET LOCAL ROLE aifans_platform')
    const role = await client.query<{rolcanlogin:boolean;rolbypassrls:boolean}>("SELECT rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname='aifans_platform'")
    expect(role.rows[0]).toEqual({rolcanlogin: false, rolbypassrls: false})
    const privileges = await client.query<{profiles_insert:boolean;posts_insert:boolean;comments_insert:boolean;create_ip:boolean;publish_post:boolean;publish_comment:boolean}>(`SELECT has_table_privilege(current_user,'public.profiles','INSERT') profiles_insert,has_table_privilege(current_user,'public.posts','INSERT') posts_insert,has_table_privilege(current_user,'public.comments','INSERT') comments_insert,has_function_privilege(current_user,'public.platform_create_ip(text,text,text,text[],uuid)','EXECUTE') create_ip,has_function_privilege(current_user,'public.platform_publish_post(uuid,text,text,uuid)','EXECUTE') publish_post,has_function_privilege(current_user,'public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid)','EXECUTE') publish_comment`)
    expect(privileges.rows[0]).toEqual({profiles_insert: false, posts_insert: false, comments_insert: false, create_ip: true, publish_post: true, publish_comment: true})
    await expect(client.query(`INSERT INTO public.posts(id,author_profile_id,source) VALUES($1,$1,'admin')`, [randomUUID()])).rejects.toMatchObject({code: '42501'})
  }))
})
