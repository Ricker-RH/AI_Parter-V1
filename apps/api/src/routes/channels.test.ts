import {randomUUID} from 'node:crypto'
import {describe,expect,it,vi} from 'vitest'
import {createApp} from '../application.js'
import type {ChannelPort} from '../ports/channels.js'

const id=randomUUID()
const summary={id,slug:'ai-news',name:'AI News',description:'News',imageUrl:null,ipCount:0}
function port(overrides:Partial<ChannelPort>={}):ChannelPort{return {listChannels:vi.fn(async()=>({items:[summary],nextCursor:null})),getChannel:vi.fn(async()=>({...summary,recommendedIps:[]})),listProfiles:vi.fn(async()=>({items:[],nextCursor:null})),listPosts:vi.fn(async()=>({items:[],nextCursor:null})),...overrides}}

describe('public channel routes',()=>{
  it('returns schema-valid directory, detail, profile and post resources',async()=>{const channels=port();const app=createApp({channels});for(const path of ['/v1/channels?q=AI&limit=10',`/v1/channels/ai-news`,`/v1/channels/ai-news/profiles?limit=5`,`/v1/channels/ai-news/posts?limit=5`])expect((await app.request(path)).status).toBe(200);expect(channels.listChannels).toHaveBeenCalledWith({q:'AI',limit:10})})
  it('rejects duplicate, unknown and malformed query parameters',async()=>{const app=createApp({channels:port()});for(const path of ['/v1/channels?limit=1&limit=2','/v1/channels?extra=x','/v1/channels/AI-News','/v1/channels/ai-news/posts?cursor=%%%'])expect((await app.request(path)).status).toBe(400)})
  it('returns explicit not-configured and not-found errors',async()=>{expect((await createApp().request('/v1/channels')).status).toBe(503);expect((await createApp({channels:port({getChannel:vi.fn(async()=>null)})}).request('/v1/channels/missing')).status).toBe(404)})
})
