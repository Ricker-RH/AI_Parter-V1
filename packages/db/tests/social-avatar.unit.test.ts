import {describe, expect, it, vi} from 'vitest'
import {createSocialRepository} from '../src/social.js'
import type {QueryClient} from '../src/session.js'

const id = '11111111-1111-4111-8111-111111111111'
const key = `public/profiles/${id}/avatar/22222222-2222-4222-8222-222222222222.webp`
const base = 'https://media.example/'
const actor = {subject: 'human'}
const notification = {id, kind: 'follow', post_id: null, comment_id: null, created_at: '2026-09-01T00:00:00Z', read_at: null, actor_id: id, actor_kind: 'human', username: 'rui', display_name: 'Rui', avatar_object_key: key}
const comment = {id, post_id: id, root_comment_id: id, parent_comment_id: null, author_id: id, author_kind: 'human', username: 'rui', display_name: 'Rui', avatar_object_key: key, body: 'Hello', state: 'published', created_at: '2026-09-01T00:00:00Z', like_count: 0, reply_count: 0, bookmark_count: 0, share_count: 0, viewer_has_liked: false, viewer_has_bookmarked: false}
function setup(rows: unknown[], publicMediaBaseUrl: string | undefined = base) {
  const query = vi.fn(async () => ({rows, rowCount: rows.length}))
  const client = {query: query as QueryClient['query'], release() {}}
  return {query, repository: createSocialRepository({publicMediaBaseUrl, withActor: async (_, callback) => callback(client), withPublic: async callback => callback(client)})}
}
describe('human social avatar projection', () => {
  it('projects avatar URLs on notification list and detail', async () => {
    const {repository} = setup([notification])
    expect((await repository.listNotifications(actor, {limit: 10})).items[0]?.actor).toMatchObject({avatarUrl: base + key})
    expect((await repository.getNotification(actor, id))?.actor).toMatchObject({avatarUrl: base + key})
  })
  it('projects avatar URLs on comment context', async () => {
    const {repository} = setup([comment])
    expect((await repository.getCommentThread({viewer: null, postId: id, commentId: id}))?.group.root.author).toMatchObject({avatarUrl: base + key})
  })
  it('projects current avatar on freshly created comments', async () => {
    const {repository, query} = setup([])
    query.mockResolvedValueOnce({rows: [{id}], rowCount: 1}).mockResolvedValueOnce({rows: [comment], rowCount: 1}).mockResolvedValueOnce({rows: [{...comment, id}], rowCount: 1})
    expect((await repository.createHumanComment(actor, id, {body: 'Hello'}, {requestId: id})).author).toMatchObject({avatarUrl: base + key})
  })
  it.each(['../secret', `public/profiles/22222222-2222-4222-8222-222222222222/avatar/a.webp`, 'https://evil.example/a.webp'])('rejects unowned or malformed avatar key %s', async avatar_object_key => {
    await expect(setup([{...notification, avatar_object_key}]).repository.listNotifications(actor, {limit: 10})).rejects.toThrow('INVALID_PUBLIC_MEDIA_KEY')
  })
  it('keeps accounts without avatars readable without media configuration', async () => {
    const {repository} = setup([{...notification, avatar_object_key: null}], '')
    expect((await repository.listNotifications(actor, {limit: 10})).items[0]?.actor).toMatchObject({avatarUrl: null})
  })
})
