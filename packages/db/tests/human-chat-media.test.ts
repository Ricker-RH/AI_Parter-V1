import {readFileSync, existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect} from 'vitest'
import {createHumanChatMediaRepository} from '../src/human-chat-media.js'

describe('private HUMAN attachment migration',()=>{
 it('keeps storage private, completion platform-only and attachment consumption atomic',()=>{
  const path=resolve(import.meta.dirname,'../migrations/202609040010_human_chat_media.sql')
  expect(existsSync(path)).toBe(true)
  const sql=readFileSync(path,'utf8')
  expect(sql).toContain('ALTER TABLE public.human_dm_attachments FORCE ROW LEVEL SECURITY')
  expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.human_dm_confirm_attachment(uuid,text,integer,integer,integer,integer) TO aifans_platform')
  expect(sql).toContain('attachment.owner_profile_id<>actor_id')
  expect(sql).toContain('attachment.conversation_id<>conversation.id')
  expect(sql).toContain('attachment.message_id IS NOT NULL')
  expect(sql).toContain('first_contact_consumed AND NOT mutual')
  expect(sql).toContain("content-'kind'-'text'='{}'::jsonb")
  expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL).*TO aifans_authenticated/)
 })
})

describe('private HUMAN attachment repository',()=>{
 it('binds actor calls, private key derivation and platform-only confirmation',async()=>{
  const id='edc5b166-125d-4af3-ac8c-233a773f66c1',peer='edc5b166-125d-4af3-ac8c-233a773f66c2'
  const calls:unknown[][]=[]
  const row={id,owner_profile_id:id,peer_profile_id:peer,conversation_id:id,kind:'image',content_type:'image/png',size_bytes:10,expires_at:new Date('2026-09-04T10:10:00Z'),finalized_at:null}
  const query=async(sql:string,args?:unknown[])=>{calls.push([sql,args]);return {rows:[row],rowCount:1}}
  const sessions:string[]=[]
  const repository=createHumanChatMediaRepository({withActor:async(a,cb)=>{sessions.push(a.subject);return cb({query,release(){}} as never)},withPlatformActor:async(a,cb)=>{sessions.push(`platform:${a.subject}`);return cb({query,release(){}} as never)}})
  const result=await repository.reserve({subject:'owner'},peer,{kind:'image',contentType:'image/png',sizeBytes:10})
  expect(result.stagingObjectKey).toBe(`private/human-chat/${id}/${id}/staging`)
  expect(calls[0]?.[1]).toEqual([peer,'image','image/png',10])
  await repository.get({subject:'owner'},id,true)
  expect(calls[1]?.[1]).toEqual([id,true])
  await repository.confirm({subject:'owner'},id,{contentType:'image/webp',sizeBytes:10,width:1,height:1})
  expect(sessions).toEqual(['owner','owner','platform:owner'])
  expect(calls[2]?.[1]).toEqual([id,'image/webp',10,1,1,null])
  await expect(repository.reserve({subject:'owner'},peer,{kind:'image',contentType:'image/png',sizeBytes:10,objectKey:'forged'} as never)).rejects.toThrow()
  expect(calls).toHaveLength(3)
 })
})
