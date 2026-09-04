import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import type {HumanProfile} from '@aifans/contracts'
import messages from '../../../messages/en.json'
import {HumanProfileTabs} from './HumanProfileTabs'
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),prefetch:vi.fn()})}))
const id='11111111-1111-4111-8111-111111111111'
const profile:HumanProfile={v:1,identity:{kind:'HUMAN',id,username:'rui',displayName:'Rui',avatarUrl:null},bio:null,background:{type:'color',colorKey:'paper'},followerCount:0,isOwner:false,visibility:'public',relationship:{following:false,followedBy:false,blockedByViewer:false,canMessage:true,messageDisabledReason:null},tabs:{ips:{state:'available'},liked:{state:'available'},saved:{state:'available'},following:{state:'available'}}}
const ip={kind:'ip',id:'22222222-2222-4222-8222-222222222222',username:'luma',displayName:'Luma',languages:['en'],visualType:'anime'}
afterEach(()=>vi.unstubAllGlobals())
it('loads visitor-scoped IPs and paginates without calling owner routes',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({state:'ready',tab:'ips',items:[ip],nextCursor:'next_page'})).mockResolvedValueOnce(Response.json({state:'ready',tab:'ips',items:[{...ip,id:'33333333-3333-4333-8333-333333333333',displayName:'Nova'}],nextCursor:null}));vi.stubGlobal('fetch',fetcher)
 render(<HumanProfileTabs profile={profile} locale="en" socialLabels={messages}/>)
 expect(await screen.findByRole('link',{name:/Luma/})).toHaveAttribute('href',`/en/profiles/${ip.id}`)
 fireEvent.click(screen.getByRole('button',{name:'Load more'}));await screen.findByRole('link',{name:/Nova/})
 expect(screen.getByRole('link',{name:/Luma/})).toBeVisible()
 expect(fetcher.mock.calls.map(call=>call[0])).toEqual([`/api/humans/${id}/tabs/ips?limit=20`,`/api/humans/${id}/tabs/ips?limit=20&cursor=next_page`])
})
it('locks every tab and discards previously loaded data if API reports private',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({state:'ready',tab:'ips',items:[ip],nextCursor:null})).mockResolvedValueOnce(Response.json({state:'locked'}));vi.stubGlobal('fetch',fetcher)
 render(<HumanProfileTabs profile={profile} locale="en" socialLabels={messages}/>)
 await screen.findByRole('link',{name:/Luma/});fireEvent.click(screen.getByRole('tab',{name:'Liked'}))
 await screen.findByText(/This profile is private/)
 fireEvent.click(screen.getByRole('tab',{name:'IPs'}));expect(screen.queryByText('Luma')).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2)
})
it('cancels stale tab requests and renders real post cards and human following links',async()=>{
 let resolveFirst!:(response:Response)=>void
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveFirst=resolve})).mockResolvedValueOnce(Response.json({state:'ready',tab:'liked',items:[{id:'44444444-4444-4444-8444-444444444444',body:'Real liked post',author:ip,languageCode:'en',publishedAt:'2026-09-01T00:00:00.000Z',likeCount:0,commentCount:0,bookmarkCount:0,shareCount:0}],nextCursor:null})).mockResolvedValueOnce(Response.json({state:'ready',tab:'following',items:[{kind:'human',id:'55555555-5555-4555-8555-555555555555',username:'alex',displayName:'Alex',avatarUrl:null}],nextCursor:null}));vi.stubGlobal('fetch',fetcher)
 render(<HumanProfileTabs profile={profile} locale="en" socialLabels={messages}/>)
 fireEvent.click(screen.getByRole('tab',{name:'Liked'}));await screen.findByText('Real liked post')
 expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true)
 resolveFirst(Response.json({state:'ready',tab:'ips',items:[ip],nextCursor:null}))
 fireEvent.click(screen.getByRole('tab',{name:'Following'}));expect(await screen.findByRole('link',{name:/Alex/})).toHaveAttribute('href','/en/humans/55555555-5555-4555-8555-555555555555')
 expect(screen.queryByText('Luma')).toBeNull()
})
it('shows recoverable wrong-tab response error rather than leaking incompatible data',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({state:'ready',tab:'following',items:[ip],nextCursor:null})).mockResolvedValueOnce(Response.json({state:'ready',tab:'ips',items:[],nextCursor:null})))
 render(<HumanProfileTabs profile={profile} locale="en" socialLabels={messages}/>)
 await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Try again'}))
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());expect(await screen.findByText('No content yet.')).toBeVisible()
})
