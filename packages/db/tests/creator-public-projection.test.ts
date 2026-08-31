import {randomUUID} from 'node:crypto'
import {Pool, type PoolClient} from 'pg'
import {afterAll, describe, expect, it} from 'vitest'
import {createSocialRepository} from '../src/social.js'

const connectionString = process.env.DATABASE_URL ?? ''
const integration = connectionString ? describe : describe.skip
const pool = new Pool({connectionString})

async function tx<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    return await callback(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

async function creatorIp(client: PoolClient, visualType: 'realistic' | 'anime' | 'hybrid') {
  const creatorId = randomUUID()
  const draftId = randomUUID()
  const revisionId = randomUUID()
  const ipId = randomUUID()
  const identityId = randomUUID()
  const username = `creator_${creatorId.replaceAll('-', '').slice(0, 16)}`
  await client.query(
    `INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name)
     VALUES($1,$2,'human',$3,'Safe Creator')`,
    [creatorId, `subject-${creatorId}`, username],
  )
  await client.query(
    `INSERT INTO public.creator_drafts(
       id,creator_profile_id,state,username,display_name,short_description,language_codes,content_themes,
       personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance
     ) VALUES($1,$2,'submitted',$3,'Creator IP','public bio',ARRAY['en'],ARRAY['art'],
       'personality','background','world','values','tone',ARRAY['art'],'boundaries','relationship',$4,'appearance')`,
    [draftId, creatorId, `ip_${ipId.replaceAll('-', '').slice(0, 16)}`, visualType],
  )
  await client.query(
    `INSERT INTO public.creator_revisions(
       id,draft_id,creator_profile_id,version,username,display_name,short_description,language_codes,content_themes,
       personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance
     ) SELECT $1,id,creator_profile_id,1,username,display_name,short_description,language_codes,content_themes,
       personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance
       FROM public.creator_drafts WHERE id=$2`,
    [revisionId, draftId],
  )
  await client.query(
    `INSERT INTO public.profiles(id,account_kind,username,display_name,bio)
     VALUES($1,'ip',$2,'Creator IP','public bio')`,
    [ipId, `ip_${ipId.replaceAll('-', '').slice(0, 16)}`],
  )
  await client.query(
    `INSERT INTO public.ip_profiles(profile_id,source,creator_profile_id,public_state,operation_enabled)
     VALUES($1,'creator',$2,'draft',false)`,
    [ipId, creatorId],
  )
  await client.query(
    `INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,bio,languages,created_by_profile_id)
     VALUES($1,$2,1,'Creator IP','public bio',ARRAY['en'],$3)`,
    [identityId, ipId, creatorId],
  )
  await client.query(
    'INSERT INTO public.creator_ip_revisions(ip_profile_id,revision_id,creator_profile_id) VALUES($1,$2,$3)',
    [ipId, revisionId, creatorId],
  )
  await client.query(
    `UPDATE public.ip_profiles SET current_identity_revision_id=$2,active_creator_revision_id=$3,public_state='published'
     WHERE profile_id=$1`,
    [ipId, identityId, revisionId],
  )
  const postId = randomUUID()
  await client.query(
    `INSERT INTO public.posts(id,author_profile_id,source,state,body,published_at)
     VALUES($1,$2,'worker','published',$3,clock_timestamp())`,
    [postId, ipId, `${visualType} post`],
  )
  return {creatorId, creatorUsername: username, ipId, postId}
}

function repository(client: PoolClient) {
  return createSocialRepository({
    withPublic: async (callback) => {
      await client.query('SAVEPOINT public_projection')
      try {
        await client.query('SET LOCAL ROLE aifans_anon')
        return await callback({query: client.query.bind(client), release() {}})
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT public_projection')
        await client.query('RELEASE SAVEPOINT public_projection')
      }
    },
  })
}

integration('creator public projection', () => {
  afterAll(async () => pool.end())

  it('returns only the bounded creator attribution and active visual type', async () => tx(async (client) => {
    const fixture = await creatorIp(client, 'anime')
    await client.query('SAVEPOINT as_anon')
    await client.query('SET LOCAL ROLE aifans_anon')
    const result = await client.query('SELECT row_to_json(p) AS value FROM public.social_public_posts() p WHERE post_id=$1', [fixture.postId])
    const privileges = await client.query<{drafts: boolean; revisions: boolean}>(
      `SELECT has_table_privilege(current_user,'public.creator_drafts','SELECT') drafts,
              has_table_privilege(current_user,'public.creator_revisions','SELECT') revisions`,
    )
    await client.query('ROLLBACK TO SAVEPOINT as_anon')
    await client.query('RELEASE SAVEPOINT as_anon')

    expect(result.rows[0]?.value).toMatchObject({
      visual_type: 'anime',
      creator_id: fixture.creatorId,
      creator_username: fixture.creatorUsername,
      creator_display_name: 'Safe Creator',
    })
    expect(Object.keys(result.rows[0]?.value ?? {}).sort()).toEqual([
      'author_profile_id', 'bio', 'body', 'creator_display_name', 'creator_id', 'creator_username',
      'display_name', 'id', 'language_code', 'languages', 'post_id', 'published_at', 'username', 'visual_type',
    ])
    expect(JSON.stringify(result.rows[0]?.value)).not.toContain('appearance')
    expect(JSON.stringify(result.rows[0]?.value)).not.toContain('object_key')
    expect(privileges.rows[0]).toEqual({drafts: false, revisions: false})
  }))

  it('defaults to mixed/all and filters all three visual types without leaking other types', async () => tx(async (client) => {
    const realistic = await creatorIp(client, 'realistic')
    const anime = await creatorIp(client, 'anime')
    const social = repository(client)

    const mixed = await social.listFeed({viewer: null, kind: 'for_you', visualType: 'all', limit: 10, after: null})
    expect(mixed.items.map((item) => item.id)).toEqual(expect.arrayContaining([realistic.postId, anime.postId]))
    const filtered = await social.listFeed({viewer: null, kind: 'for_you', visualType: 'anime', limit: 10, after: null})
    expect(filtered.items.map((item) => item.id)).toContain(anime.postId)
    expect(filtered.items.map((item) => item.id)).not.toContain(realistic.postId)
    expect(filtered.items.find((item) => item.id === anime.postId)?.author).toMatchObject({
      visualType: 'anime',
      creator: {id: anime.creatorId, username: anime.creatorUsername, displayName: 'Safe Creator'},
    })
  }))
})
