import {describe,it,expect} from 'vitest'
import {HUMAN_CHAT_STICKERS,HumanStickerIdSchema,HumanShareCardSchema,HumanShareTargetQuerySchema} from './human-chat-rich-content.js'
describe('bounded rich human chat content',()=>{
 it('ships six license-safe Unicode stickers with strict IDs',()=>{
  expect(HUMAN_CHAT_STICKERS).toHaveLength(6)
  for(const item of HUMAN_CHAT_STICKERS){expect(HumanStickerIdSchema.parse(item.id)).toBe(item.id);expect(item.glyph).not.toMatch(/https?:/)}
  expect(HumanStickerIdSchema.safeParse('untrusted').success).toBe(false)
 })
 it('bounds selection and excludes arbitrary links or card authors',()=>{
  expect(HumanShareTargetQuerySchema.parse({kind:'post'})).toEqual({kind:'post',q:'',limit:10})
  expect(HumanShareTargetQuerySchema.safeParse({kind:'post',limit:21}).success).toBe(false)
  expect(HumanShareCardSchema.safeParse({target:{kind:'human',id:'edc5b166-125d-4af3-ac8c-233a773f66c1'},title:'Name',subtitle:'@name',url:'https://evil.test'}).success).toBe(false)
 })
})
