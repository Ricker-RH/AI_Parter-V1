import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {afterAll,describe,expect,it,vi} from 'vitest'
import {createInboxPreferencesRepository} from '../src/inbox-preferences.js'
import {createChatRepository} from '../src/chat.js'
import {createHumanChatRepository} from '../src/human-chat.js'
import {createActorSession,type WithActor,type QueryClient} from '../src/session.js'

it('validates inbox commands before entering the database session',async()=>{
  const withActor=vi.fn() as unknown as WithActor
  const repo=createInboxPreferencesRepository({withActor})
  await expect(repo.mutate({subject:'a'},{kind:'HUMAN',conversationId:'not-a-uuid',action:'delete'})).rejects.toThrow()
  expect(withActor).not.toHaveBeenCalled()
})
it('uses the actor-scoped database command for deletion and pin changes',async()=>{
  const query=vi.fn(async()=>({rows:[],rowCount:0}))
  const withActor=vi.fn(async(_actor,cb)=>cb({query} as unknown as QueryClient)) as WithActor
  const repo=createInboxPreferencesRepository({withActor});const id=randomUUID()
  for(const action of ['pin','unpin','delete'] as const){
    await repo.mutate({subject:'a'},{kind:'IP',conversationId:id,action})
    expect(query).toHaveBeenLastCalledWith('SELECT public.mutate_inbox_preference($1,$2::uuid,$3)',['IP',id,action])
  }
})
const connectionString=process.env.HUMAN_DM_TEST_DATABASE_URL
const integration=connectionString?describe:describe.skip
integration('single-viewer inbox tombstones',()=>{
  const pool=new Pool({connectionString});afterAll(()=>pool.end())
  it('deletes only the viewer history, clears unread, restores only newer messages and denies outsiders',async()=>{
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      const people=Array.from({length:3},()=>{const id=randomUUID();return {id,subject:`pref-${id}`}})
      for(const p of people)await client.query("INSERT INTO public.profiles(id,auth_subject,account_kind,username,display_name) VALUES($1,$2,'human',$3,'Inbox')",[p.id,p.subject,`pref_${p.id.replaceAll('-','').slice(0,18)}`])
      const [a,b,other]=people as [typeof people[number],typeof people[number],typeof people[number]]
      const {withActor}=createActorSession({connect:async()=>({query:client.query.bind(client),release:()=>{}} as QueryClient)},{transactionMode:'nested'})
      const prefs=createInboxPreferencesRepository({withActor});const chat=createHumanChatRepository({withActor})
      await withActor(a,async c=>{await c.query('SELECT public.human_follow_profile($1)',[b.id])})
      await withActor(b,async c=>{await c.query('SELECT public.human_follow_profile($1)',[a.id])})
      const conv=await chat.open(a,{peerProfileId:b.id})
      await chat.send(b,{peerProfileId:a.id,clientRequestId:randomUUID(),content:{kind:'text',text:'old'}})
      await prefs.mutate(a,{kind:'HUMAN',conversationId:conv.id,action:'pin'})
      expect((await prefs.list(a)).items[0]?.pinnedAt).toBeTruthy()
      expect((await prefs.list(b)).items).toHaveLength(0)
      await expect(prefs.mutate(other,{kind:'HUMAN',conversationId:conv.id,action:'delete'})).rejects.toMatchObject({code:'P0002'})
      await prefs.mutate(a,{kind:'HUMAN',conversationId:conv.id,action:'delete'})
      expect((await chat.list(a,{limit:20})).items).toHaveLength(0)
      expect(await chat.history(a,{conversationId:conv.id,afterSequence:0,limit:20})).toHaveLength(0)
      expect(await chat.history(b,{conversationId:conv.id,afterSequence:0,limit:20})).toHaveLength(1)
      await chat.send(b,{peerProfileId:a.id,clientRequestId:randomUUID(),content:{kind:'text',text:'new'}})
      expect((await chat.list(a,{limit:20})).items[0]).toMatchObject({unreadCount:1,lastReadSequence:1,latestMessage:{content:{text:'new'}}})
      expect((await chat.history(a,{conversationId:conv.id,afterSequence:0,limit:20})).map(m=>m.content)).toEqual([{kind:'text',text:'new'}])
      expect(await chat.history(b,{conversationId:conv.id,afterSequence:0,limit:20})).toHaveLength(2)
      const ip=randomUUID(),revision=randomUUID()
      await client.query("INSERT INTO public.profiles(id,account_kind,username,display_name) VALUES($1,'ip',$2,'IP')",[ip,`pref_ip_${ip.replaceAll('-','').slice(0,16)}`])
      await client.query("INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled) VALUES($1,'platform','draft',false)",[ip])
      await client.query("INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,languages) VALUES($1,$2,1,'IP',ARRAY['en'])",[revision,ip])
      await client.query("UPDATE public.ip_profiles SET current_identity_revision_id=$2,public_state='published',operation_enabled=true WHERE profile_id=$1",[ip,revision])
      const ai=createChatRepository(withActor)
      const aiConv=await ai.getOrCreateConversation(a,{humanProfileId:a.id,ipProfileId:ip,sendEnabled:true})
      expect(aiConv).not.toBeNull()
      // Admin fixture inserts emulate completed delivery without calling a provider.
      const oldRequest=randomUUID()
      await client.query("INSERT INTO public.chat_messages(conversation_id,role,body,delivery_state,client_request_id,created_at) VALUES($1,'human','prompt','sent',$2,clock_timestamp())",[aiConv!.id,oldRequest])
      await client.query("INSERT INTO public.chat_messages(conversation_id,role,body,delivery_state,in_reply_to_client_request_id,created_at) VALUES($1,'assistant','old AI','sent',$2,clock_timestamp())",[aiConv!.id,oldRequest])
      await prefs.mutate(a,{kind:'IP',conversationId:aiConv!.id,action:'delete'})
      expect((await ai.listConversations(a,{limit:20,sendEnabled:true})).items).toHaveLength(0)
      expect((await ai.listMessages(a,{conversationId:aiConv!.id,limit:20,sendEnabled:true}))?.items).toHaveLength(0)
      expect((await ai.getConversation(a,{conversationId:aiConv!.id,sendEnabled:true}))?.lastMessage).toBeNull()
      const newRequest=randomUUID()
      await client.query("INSERT INTO public.chat_messages(conversation_id,role,body,delivery_state,client_request_id,created_at) VALUES($1,'human','prompt','sent',$2,clock_timestamp())",[aiConv!.id,newRequest])
      await client.query("INSERT INTO public.chat_messages(conversation_id,role,body,delivery_state,in_reply_to_client_request_id,created_at) VALUES($1,'assistant','new AI','sent',$2,clock_timestamp())",[aiConv!.id,newRequest])
      expect((await ai.listConversations(a,{limit:20,sendEnabled:true})).items[0]).toMatchObject({unreadCount:1,lastMessage:{body:'new AI'}})
      expect((await ai.listMessages(a,{conversationId:aiConv!.id,limit:20,sendEnabled:true}))?.items.map(m=>m.body)).toEqual(['prompt','new AI'])

    }finally{await client.query('ROLLBACK');client.release()}
  })
})
