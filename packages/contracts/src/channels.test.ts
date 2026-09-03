import {describe, expect, it} from 'vitest'
import {
  ChannelDetailSchema,
  ChannelDirectoryCursorSchema,
  ChannelIpCursorSchema,
  ChannelPostCursorSchema,
  AdminChannelCursorSchema,
  AdminChannelPageSchema,
  AdminChannelQuerySchema,
  ChannelQuerySchema,
  ChannelSlugSchema,
  CreateChannelSchema,
  ReplaceChannelAliasesSchema,
  SetChannelMembershipSchema,
  UpdateChannelSchema,
  decodeChannelCursor,
  encodeChannelCursor,
} from './channels.js'

const id='11111111-1111-4111-8111-111111111111'
const ip={kind:'ip' as const,id,username:'sample_ip',displayName:'Sample IP',languages:['zh-CN' as const],visualType:'realistic' as const}

describe('channel contracts',()=>{
  it('accepts canonical slugs and rejects path-like values',()=>{
    expect(ChannelSlugSchema.parse('ai-news')).toBe('ai-news')
    for(const value of ['AI-News','ai_news','-ai','ai/../news','']) expect(()=>ChannelSlugSchema.parse(value)).toThrow()
  })

  it('normalizes bounded directory queries and rejects unknown input',()=>{
    expect(ChannelQuerySchema.parse({q:'  人工   智能  '})).toEqual({q:'人工 智能',limit:20})
    expect(()=>ChannelQuerySchema.parse({limit:51})).toThrow()
    expect(()=>ChannelQuerySchema.parse({limit:20,extra:'x'})).toThrow()
  })

  it('validates channel detail without leaking storage keys',()=>{
    expect(ChannelDetailSchema.parse({id,slug:'ai-news',name:'AI News',description:'News',imageUrl:null,ipCount:1,recommendedIps:[ip]}).recommendedIps).toEqual([ip])
    expect(()=>ChannelDetailSchema.parse({id,slug:'ai-news',name:'AI News',description:'News',imageUrl:null,imageObjectKey:'secret',ipCount:1,recommendedIps:[]})).toThrow()
    expect(()=>ChannelDetailSchema.parse({id,slug:'ai-news',name:'AI News',description:'News',imageUrl:'http://media.example/channel.webp',ipCount:1,recommendedIps:[]})).toThrow()
  })

  it('round-trips canonical channel cursors and rejects malformed or noncanonical encodings',()=>{
    const cursors=[
      ChannelDirectoryCursorSchema.parse({v:1,kind:'channel_directory',query:'人工智能',rank:0.75,sortOrder:2,id}),
      ChannelIpCursorSchema.parse({v:1,kind:'channel_ips',channelId:id,curationWeight:5,feedWeight:4,latestPublishedAt:null,profileId:id}),
      ChannelPostCursorSchema.parse({v:1,kind:'channel_posts',channelId:id,publishedAt:'2026-09-04T00:00:00.000Z',id}),
    ]
    for(const cursor of cursors){const encoded=encodeChannelCursor(cursor); expect(decodeChannelCursor(encoded)).toEqual(cursor); expect(()=>decodeChannelCursor(encoded+'=')).toThrow('INVALID_CURSOR')}
    expect(()=>decodeChannelCursor('a'.repeat(2049))).toThrow('INVALID_CURSOR')
  })

  it('validates strict operator mutations',()=>{
    expect(CreateChannelSchema.parse({slug:'ai-news',name:'AI News'})).toEqual({slug:'ai-news',name:'AI News',description:'',sortOrder:0})
    expect(UpdateChannelSchema.parse({name:'AI Daily',description:'Daily',sortOrder:3})).toEqual({name:'AI Daily',description:'Daily',sortOrder:3})
    expect(ReplaceChannelAliasesSchema.parse({aliases:['人工智能','AI']})).toEqual({aliases:['人工智能','AI']})
    expect(SetChannelMembershipSchema.parse({ipProfileId:id,isPrimary:true,curationWeight:9})).toEqual({ipProfileId:id,isPrimary:true,curationWeight:9})
    expect(()=>SetChannelMembershipSchema.parse({ipProfileId:id,isPrimary:false,curationWeight:1,extra:true})).toThrow()
    expect(CreateChannelSchema.parse({slug:'ai-news',name:'AI News',imageObjectKey:`public/channels/${id}.webp`}).imageObjectKey).toBe(`public/channels/${id}.webp`)
    expect(()=>CreateChannelSchema.parse({slug:'ai-news',name:'AI News',imageObjectKey:'https://attacker.example/x.webp'})).toThrow()
    expect(()=>UpdateChannelSchema.parse({imageObjectKey:'../private/secret.png'})).toThrow()
  })

  it('validates operator listing filters and a stable bound cursor',()=>{
    expect(AdminChannelQuerySchema.parse({q:'  AI  ',status:'draft'})).toEqual({q:'AI',status:'draft',limit:25})
    expect(()=>AdminChannelQuerySchema.parse({limit:51})).toThrow()
    const cursor=AdminChannelCursorSchema.parse({v:1,kind:'admin_channels',query:'AI',status:'draft',sortOrder:2,updatedAt:'2026-09-04T00:00:00.000Z',id})
    expect(decodeChannelCursor(encodeChannelCursor(cursor),'admin_channels')).toEqual(cursor)
    expect(AdminChannelPageSchema.parse({items:[],nextCursor:null})).toEqual({items:[],nextCursor:null})
  })
})
