import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect} from 'vitest'
import {HUMAN_CHAT_STICKERS} from '@aifans/contracts'
import {createHumanChatRichContentRepository} from '../src/human-chat-rich-content.js'
describe('rich human DM migration',()=>{
 it('adds server-resolved bounded content without relaxing existing message policy',()=>{
  const path=resolve(import.meta.dirname,'../migrations/202609040013_human_chat_rich_content.sql')
  expect(existsSync(path)).toBe(true)
  const sql=readFileSync(path,'utf8')
  expect(sql).toContain('first_contact_consumed AND NOT mutual')
  expect(sql).toContain('attachment.owner_profile_id<>actor_id')
  expect(sql).toContain("content-'kind'-'text'='{}'::jsonb")
  expect(sql).toContain('human_dm_share_card')
  expect(sql).toContain('FROM PUBLIC,aifans_anon,aifans_authenticated')
  for(const sticker of HUMAN_CHAT_STICKERS)expect(sql).toContain(`'${sticker.id}'`)
 })
 it('queries bound target IDs and never accepts caller-supplied card fields',async()=>{
  const id='edc5b166-125d-4af3-ac8c-233a773f66c1',card={target:{kind:'human',id},title:'Human',subtitle:'@human'},calls:unknown[][]=[]
  const repository=createHumanChatRichContentRepository({withActor:async(actor,cb)=>{expect(actor).toEqual({subject:'verified'});return cb({query:async(sql:string,values:unknown[])=>{calls.push([sql,values]);return {rows:[{card,resolution:{state:'available',card}}],rowCount:1}},release(){}} as never)}})
  expect(await repository.listTargets({subject:'verified'},{kind:'human',q:'name',limit:10})).toEqual({items:[card]})
  expect(await repository.resolveTarget({subject:'verified'},{kind:'human',id})).toEqual({state:'available',card})
  expect(calls.map(call=>call[1])).toEqual([['human','name',10],['human',id]])
  await expect(repository.resolveTarget({subject:'verified'},{kind:'human',id,title:'forged'} as never)).rejects.toThrow()
  expect(calls).toHaveLength(2)
 })
})
