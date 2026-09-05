import {QueryClient} from '@tanstack/react-query'
import {afterEach, expect, it, vi} from 'vitest'
import {humanInboxQueryOptions} from './human-inbox-query.js'

const self='11111111-1111-4111-8111-111111111111'
const peer='22222222-2222-4222-8222-222222222222'
const conversation={v:1,id:'33333333-3333-4333-8333-333333333333',createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z',participants:[{kind:'HUMAN',id:self,displayName:'Me',username:'myself',avatarUrl:null},{kind:'HUMAN',id:peer,displayName:'Alice',username:'alice',avatarUrl:null}]}

afterEach(()=>vi.unstubAllGlobals())

it('prefetches the same first human inbox page consumed by the conversation workspace',async()=>{
  const fetch=vi.fn(async()=>Response.json({items:[{conversation,latestMessage:null,unreadCount:2,lastReadSequence:0}],nextCursor:null}))
  vi.stubGlobal('fetch',fetch)
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  const options=humanInboxQueryOptions(self)

  await client.prefetchQuery(options)

  expect(options.queryKey).toEqual(['human-chat',self,'inbox-page',null])
  expect(fetch).toHaveBeenCalledWith('/api/human-chat/conversations?limit=100',expect.objectContaining({method:'GET'}))
  expect(client.getQueryData(options.queryKey)).toEqual({items:[{conversation,latestMessage:null,unreadCount:2,lastReadSequence:0}],cursor:null})
})
