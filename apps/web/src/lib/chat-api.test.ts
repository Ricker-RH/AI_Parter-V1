import {afterEach, describe, expect, it, vi} from 'vitest'
const {getApiBearerToken}=vi.hoisted(()=>({getApiBearerToken:vi.fn(async()=> 'signed-jwt')}))
vi.mock('./auth/server.js',()=>({getApiBearerToken}))
import {fetchConversationHistory, fetchConversations} from './chat-api.js'

const ipProfile={id:'11111111-1111-4111-8111-111111111111',username:'luma',displayName:'Luma'}
const conversation={id:'22222222-2222-4222-8222-222222222222',ipProfile,lastMessage:null,updatedAt:'2026-09-01T01:00:00.000Z',sendEnabled:true}

afterEach(()=>{vi.unstubAllGlobals();delete process.env.AIFANS_API_URL})

describe('persistent chat server API',()=>{
  it('uses the internal API with bearer authentication and strictly parses conversation reads',async()=>{
    process.env.AIFANS_API_URL='https://api.example/'
    const upstream=vi.fn().mockResolvedValueOnce(Response.json({items:[conversation],nextCursor:null})).mockResolvedValueOnce(Response.json({conversation,items:[],nextCursor:null}))
    vi.stubGlobal('fetch',upstream)
    await expect(fetchConversations({cursor:'next cursor'})).resolves.toEqual({status:'ok',data:{items:[conversation],nextCursor:null}})
    await expect(fetchConversationHistory(conversation.id,{cursor:'previous'})).resolves.toEqual({status:'ok',data:{conversation,items:[],nextCursor:null}})
    expect(upstream.mock.calls.map(([url])=>url)).toEqual(['https://api.example/v1/chat/conversations?cursor=next+cursor',`https://api.example/v1/chat/conversations/${conversation.id}/messages?cursor=previous`])
    expect(upstream.mock.calls[0]?.[1]).toEqual(expect.objectContaining({headers:{authorization:'Bearer signed-jwt'}}))
  })

  it('returns only provider-neutral states for authorization, missing, malformed, and unavailable responses',async()=>{
    process.env.AIFANS_API_URL='https://api.example'
    const upstream=vi.fn().mockResolvedValueOnce(new Response(null,{status:401})).mockResolvedValueOnce(Response.json({code:'CHAT_CONVERSATION_NOT_FOUND',message:'Missing',requestId:'req-missing'},{status:404})).mockResolvedValueOnce(Response.json({items:[{...conversation,providerConversationId:'secret'}],nextCursor:null})).mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch',upstream)
    await expect(fetchConversations()).resolves.toEqual({status:'auth-required'})
    await expect(fetchConversationHistory(conversation.id)).resolves.toEqual({status:'not-found'})
    await expect(fetchConversations()).resolves.toEqual({status:'unavailable'})
    await expect(fetchConversations()).resolves.toEqual({status:'unavailable'})
  })
})
