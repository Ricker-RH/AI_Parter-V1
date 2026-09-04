import {describe,it,expect} from 'vitest'
import {AiRealtimeEventSchema,RealtimeEventSchema} from './ai-realtime.js'
const id='edc5b166-125d-4af3-ac8c-233a773f66c1'
describe('AI generation invalidation envelope',()=>{
 it('accepts bounded ID/state invalidations without fabricated human presence or token data',()=>{
  const event={v:1,type:'ai_generation',eventId:id,conversationId:id,messageId:id,state:'partial',occurredAt:'2026-09-04T10:00:00Z'}
  expect(RealtimeEventSchema.parse(event)).toEqual(event)
  for(const extra of [{answer:'secret'},{online:true},{read:true},{token:'text'},{state:'online'}])expect(AiRealtimeEventSchema.safeParse({...event,...extra}).success).toBe(false)
 })
})
