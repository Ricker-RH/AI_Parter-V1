import {randomUUID} from 'node:crypto'
import {AccountSchema} from '@aifans/contracts'
import {describe, expect, it, vi} from 'vitest'
import {createApp,type AppDependencies} from '../application.js'

const profileId = randomUUID(), peerProfileId = randomUUID(), conversationId = randomUUID(), clientRequestId = randomUUID()
const message = {v: 1, id: randomUUID(), conversationId, senderProfileId: profileId, clientRequestId, sequence: 1, createdAt: '2026-09-04T00:00:00.000Z', content: {kind: 'text', text: 'hello'}}
const sendPath = `/v1/human-chat/peers/${peerProfileId}/messages`
const historyPath = `/v1/human-chat/conversations/${conversationId}/messages`
const readPath = `/v1/human-chat/conversations/${conversationId}/read`
function setup(status: 'authenticated' | 'missing' | 'invalid' = 'authenticated', kind: 'human' | 'ip' = 'human',overrides:Partial<AppDependencies>={}) {
  const humanChat = {send: vi.fn(async () => message), history: vi.fn(async () => [message]), markRead: vi.fn(async () => 1)}
  const profiles = {ensureHumanProfile: vi.fn(), getCurrentAccount: vi.fn(async () => AccountSchema.parse({id: profileId, kind, username: 'human_actor', displayName: 'Human', preferredLocale: 'en', creatorModeEnabled: false}))}
  const auth = {verify: vi.fn(async () => status === 'authenticated' ? {status, identity: {subject: 'verified-subject'}} as const : {status})}
  return {humanChat, profiles, app: createApp({auth, profiles, humanChat,...overrides})}
}
function post(body: unknown) {return {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}}
const sendBody = {clientRequestId, content: {kind: 'text', text: ' hello '}}
const conversation = {v: 1 as const, id: conversationId, participants: [{kind: 'HUMAN', id: profileId, username: 'actor_human', displayName: 'Actor', avatarUrl: null}, {kind: 'HUMAN', id: peerProfileId, username: 'peer_human', displayName: 'Peer', avatarUrl: null}], createdAt: message.createdAt, updatedAt: message.createdAt}

describe('human text chat routes', () => {
  it('accepts catalog stickers and ID-only shares only with rich content support',async()=>{
    const humanChatRichContent={listTargets:vi.fn(),resolveTarget:vi.fn()}
    const {app,humanChat}=setup('authenticated','human',{humanChatRichContent} as never)
    for(const content of [{kind:'sticker',stickerId:'wave'},{kind:'share',target:{kind:'post',id:randomUUID()}}]){
      humanChat.send.mockResolvedValue({...message,content} as never)
      expect((await app.request(sendPath,post({clientRequestId,content}))).status).toBe(200)
    }
    const before=humanChat.send.mock.calls.length
    expect((await app.request(sendPath,post({clientRequestId,content:{kind:'sticker',stickerId:'forged'}}))).status).toBe(400)
    expect(humanChat.send).toHaveBeenCalledTimes(before)
  })
  it('allows image and voice references only when private media validation is configured',async()=>{
    const humanChatMedia={reserve:vi.fn(),finalize:vi.fn(),download:vi.fn()}
    const {app,humanChat}=setup('authenticated','human',{humanChatMedia})
    for(const kind of ['image','voice']) {
      const content={kind,attachmentId:randomUUID()}
      humanChat.send.mockResolvedValue({...message,content})
      expect((await app.request(sendPath,post({clientRequestId,content}))).status).toBe(200)
    }
  })
  it('schedules persisted events through the production middleware ordering',async()=>{
    const deliverBatch=vi.fn(async()=>({claimed:1,delivered:1,retried:0}))
    const {app}=setup('authenticated','human',{realtimeDelivery:{deliverBatch}})
    expect((await app.request(sendPath,post(sendBody))).status).toBe(200)
    expect(deliverBatch).toHaveBeenCalledWith(10)
  })
  it('opens conversations and lists private inbox entries using authenticated identity', async () => {
    const {app, humanChat} = setup()
    humanChat.open = vi.fn(async () => conversation)
    humanChat.list = vi.fn(async () => ({items: [{conversation, latestMessage: message, unreadCount: 1, lastReadSequence: 0}], nextCursor: null}))
    const opened = await app.request('/v1/human-chat/conversations', post({peerProfileId}))
    expect(opened.status).toBe(200); expect(await opened.json()).toEqual({conversation})
    expect(humanChat.open).toHaveBeenCalledWith({subject: 'verified-subject'}, {peerProfileId})
    const inbox = await app.request('/v1/human-chat/conversations?limit=10')
    expect(inbox.status).toBe(200); expect((await inbox.json()).items).toHaveLength(1)
    expect(inbox.headers.get('cache-control')).toBe('private, no-store')
    expect(humanChat.list).toHaveBeenCalledWith({subject: 'verified-subject'}, {limit: 10})
  })
  it('authenticates inbox operations and rejects forged opens and malformed cursors before storage', async () => {
    const missing = setup('missing')
    expect((await missing.app.request('/v1/human-chat/conversations?limit=bad')).status).toBe(401)
    expect((await missing.app.request('/v1/human-chat/conversations', post({actor: profileId}))).status).toBe(401)
    const {app, humanChat} = setup()
    humanChat.open = vi.fn(); humanChat.list = vi.fn()
    for (const query of ['limit=0', 'limit=101', 'limit=1&limit=2', 'cursor=bad', 'extra=1']) expect((await app.request('/v1/human-chat/conversations?' + query)).status).toBe(400)
    expect((await app.request('/v1/human-chat/conversations', post({peerProfileId, senderProfileId: profileId}))).status).toBe(400)
    expect(humanChat.open).not.toHaveBeenCalled(); expect(humanChat.list).not.toHaveBeenCalled()
  })
  it('keeps early middleware errors and unknown private paths non-cacheable', async () => {
    const limited = createApp({requireRateLimit: true})
    const response = await limited.request(sendPath, post(sendBody))
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    for (const path of ['/v1/human-chat', '/v1/human-chat/unknown', '/v1/realtime/ticket']) {
      const missing = await createApp().request(path)
      expect(missing.headers.get('cache-control')).toBe('private, no-store')
    }
    const oversized = await createApp().request(sendPath, post({text: 'x'.repeat(70000)}))
    expect(oversized.status).toBe(413)
    expect(oversized.headers.get('cache-control')).toBe('private, no-store')
  })
  it('does not accept method override headers', async () => {
    const {app, humanChat} = setup()
    expect((await app.request(sendPath, {method: 'PUT', headers: {'x-http-method-override': 'POST'}, body: JSON.stringify(sendBody)})).status).toBe(404)
    expect(humanChat.send).not.toHaveBeenCalled()
  })
  it('uses the verified actor and validates private send, history and read responses', async () => {
    const {app, humanChat, profiles} = setup()
    const sent = await app.request(sendPath, post(sendBody))
    expect(sent.status).toBe(200)
    expect(sent.headers.get('cache-control')).toBe('private, no-store')
    expect(await sent.json()).toEqual({message})
    expect(profiles.getCurrentAccount).toHaveBeenCalledWith({subject: 'verified-subject'})
    expect(humanChat.send).toHaveBeenCalledWith({subject: 'verified-subject'}, {...sendBody, content: message.content, peerProfileId})
    expect(await (await app.request(historyPath)).json()).toEqual({items: [message]})
    expect(humanChat.history).toHaveBeenCalledWith({subject: 'verified-subject'}, {conversationId, afterSequence: 0, limit: 50})
    expect(await (await app.request(readPath, post({lastReadSequence: 1}))).json()).toEqual({conversationId, profileId, lastReadSequence: 1})
  })
  it.each(['missing', 'invalid'] as const)('authenticates %s before parsing invalid bodies or accessing profiles/storage', async status => {
    const {app, profiles, humanChat} = setup(status)
    for (const [path, options] of [[sendPath, {method: 'POST', body: '{'}], [historyPath + '?limit=bad', undefined], [readPath, post({forged: true})]] as const) {
      const response = await app.request(path, options)
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(profiles.getCurrentAccount).not.toHaveBeenCalled()
    expect(humanChat.send).not.toHaveBeenCalled()
    expect(humanChat.history).not.toHaveBeenCalled()
    expect(humanChat.markRead).not.toHaveBeenCalled()
  })
  it('denies non-human accounts', async () => {const {app, humanChat} = setup('authenticated', 'ip'); expect((await app.request(sendPath, post(sendBody))).status).toBe(403); expect(humanChat.send).not.toHaveBeenCalled()})
  it('rejects forged identity, malformed and excessive text without storage', async () => {
    const {app, humanChat} = setup()
    for (const body of [{...sendBody, senderProfileId: profileId}, {...sendBody, conversationId}, {...sendBody, content: {kind: 'text', text: '  '}}, {...sendBody, content: {kind: 'text', text: 'x'.repeat(4001)}}, {...sendBody, content: {kind: 'text', text: 'ok', secret: true}}, {...sendBody, clientRequestId: 'bad'}]) expect((await app.request(sendPath, post(body))).status).toBe(400)
    expect((await app.request(sendPath, {method: 'POST', body: `{"clientRequestId":"${clientRequestId}","content":{"kind":"text","text":"one","text":"two"}}`})).status).toBe(400)
    expect(humanChat.send).not.toHaveBeenCalled()
  })
  it('rejects non-text message kinds explicitly before storage', async () => {
    const {app, humanChat} = setup()
    for (const content of [{kind: 'image', attachmentId: randomUUID()}, {kind: 'voice', attachmentId: randomUUID()}, {kind: 'sticker', stickerId: 'smile'}, {kind: 'share', target: {kind: 'post', id: randomUUID()}}]) {
      const response = await app.request(sendPath, post({clientRequestId, content})); expect(response.status).toBe(422); expect(await response.json()).toMatchObject({code: 'HUMAN_MESSAGE_KIND_UNSUPPORTED'})
    }
    expect(humanChat.send).not.toHaveBeenCalled()
  })
  it('rejects invalid, duplicate and unknown queries and invalid read cursors without storage', async () => {
    const {app, humanChat} = setup()
    for (const query of ['limit=0', 'limit=101', 'limit=1&limit=2', 'other=1', 'afterSequence=-1', 'afterSequence=9007199254740992', 'limit=', 'limit=1e1', 'afterSequence=1.5']) expect((await app.request(historyPath + '?' + query)).status).toBe(400)
    for (const body of [{lastReadSequence: -1}, {lastReadSequence: 1.5}, {lastReadSequence: 9007199254740992}, {lastReadSequence: 1, profileId}]) expect((await app.request(readPath, post(body))).status).toBe(400)
    expect((await app.request(sendPath + '?sender=x', post(sendBody))).status).toBe(400)
    expect(humanChat.history).not.toHaveBeenCalled(); expect(humanChat.markRead).not.toHaveBeenCalled(); expect(humanChat.send).not.toHaveBeenCalled()
  })
  it.each([['PDM01', 403, 'HUMAN_CHAT_BLOCKED'], ['PDM02', 403, 'HUMAN_CHAT_MUTUAL_FOLLOW_REQUIRED'], ['42501', 404, 'HUMAN_CHAT_NOT_FOUND'], ['P0002', 404, 'HUMAN_CHAT_NOT_FOUND'], ['23505', 409, 'HUMAN_CHAT_CONFLICT'], ['22023', 422, 'HUMAN_CHAT_INVALID_OPERATION']] as const)('maps %s safely on every operation', async (code, status, responseCode) => {
    const {app, humanChat} = setup()
    for (const method of Object.values(humanChat)) method.mockRejectedValue({code, message: 'secret postgres connection and content'})
    for (const [path, options] of [[sendPath, post(sendBody)], [historyPath, undefined], [readPath, post({lastReadSequence: 1})]] as const) {
      const response = await app.request(path, options); expect(response.status).toBe(status); expect(await response.json()).toMatchObject({code: responseCode}); expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
  })
  it('does not expose invalid repository output or unexpected errors', async () => {
    const {app, humanChat} = setup()
    humanChat.send.mockResolvedValue({...message, sequence: -1})
    let response = await app.request(sendPath, post(sendBody)); expect(response.status).toBe(500); expect(await response.text()).not.toContain('sequence')
    humanChat.history.mockRejectedValue(new Error('secret password'))
    response = await app.request(historyPath); expect(response.status).toBe(500); expect(await response.text()).not.toContain('secret')
  })
})
