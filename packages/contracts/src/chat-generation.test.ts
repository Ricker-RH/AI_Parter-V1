import {it,expect} from 'vitest'
import {ChatMessageSchema} from './chat.js'

it('preserves bounded durable generation progress on a human request',()=>{
  const value={id:'00000000-0000-4000-8000-000000000001',role:'human',body:'Hello',deliveryState:'failed',createdAt:'2026-09-04T00:00:00Z',generation:{state:'failed',answer:'Partial answer'}}
  expect(ChatMessageSchema.parse(value)).toEqual(value)
  expect(ChatMessageSchema.safeParse({...value,generation:{state:'partial',answer:'x'.repeat(4001)}}).success).toBe(false)
})
it('preserves request correlation for authorized history reconciliation',()=>{
 const value={id:'00000000-0000-4000-8000-000000000001',role:'human',body:'Hello',deliveryState:'pending',createdAt:'2026-09-04T00:00:00Z',clientRequestId:'00000000-0000-4000-8000-000000000002'}
 expect(ChatMessageSchema.parse(value)).toEqual(value)
})
