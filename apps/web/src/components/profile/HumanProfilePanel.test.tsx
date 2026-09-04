import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import type {HumanProfile} from '@aifans/contracts'
import {HumanProfilePanel} from './HumanProfilePanel'

const push = vi.fn()
vi.mock('next/navigation', () => ({useRouter: () => ({push, replace:vi.fn(), refresh:vi.fn()}), usePathname:()=>'/en/humans/peer'}))
vi.mock('../GlobalMoreMenu',()=>({GlobalMoreMenu:()=>null}))
const id='11111111-1111-4111-8111-111111111111'
export const profile: HumanProfile={v:1,identity:{kind:'HUMAN',id,displayName:'Rui',username:'rui',avatarUrl:null},bio:'Hello there',background:{type:'color',colorKey:'paper'},visibility:'private',isOwner:false,relationship:{following:false,followedBy:true,blockedByViewer:false,canMessage:true,messageDisabledReason:null},tabs:{ips:{state:'locked'},liked:{state:'locked'},saved:{state:'locked'},following:{state:'locked'}}}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
it('keeps identity visible but locks all four private tabs without fetching content',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 render(<HumanProfilePanel initialProfile={profile} locale="en"/>)
 expect(screen.getByText('Hello there')).toBeInTheDocument()
 expect(screen.getAllByRole('tab')).toHaveLength(4)
 for(const tab of screen.getAllByRole('tab')){fireEvent.click(tab);expect(screen.getByRole('tabpanel')).toHaveTextContent('This profile is private');expect(tab).toHaveAttribute('aria-describedby','human-profile-private');expect(tab.querySelector('svg')).not.toBeNull()}
 expect(fetcher).not.toHaveBeenCalled()
 fireEvent.keyDown(screen.getAllByRole('tab')[0]!,{key:'End'})
 expect(screen.getAllByRole('tab')[3]).toHaveFocus()
})
it('does not use owner content endpoints for a public visitor',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 render(<HumanProfilePanel initialProfile={{...profile,visibility:'public',tabs:{ips:{state:'available'},liked:{state:'available'},saved:{state:'available'},following:{state:'available'}}}} locale="en"/>)
 expect(screen.getByRole('tabpanel')).toHaveTextContent('This section is not available yet')
 expect(fetcher).not.toHaveBeenCalled()
})
it('follows back using strict empty JSON then refreshes authoritative relationship',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({changed:true})).mockResolvedValueOnce(Response.json({...profile,relationship:{...profile.relationship,following:true}}));vi.stubGlobal('fetch',fetcher)
 render(<HumanProfilePanel initialProfile={profile} locale="en"/>)
 fireEvent.click(screen.getByRole('button',{name:'Follow back'}))
 await screen.findByRole('button',{name:'Following'})
 expect(fetcher).toHaveBeenNthCalledWith(1,`/api/humans/${id}/follow`,expect.objectContaining({method:'PUT',body:'{}',headers:{'content-type':'application/json'}}))
})
it('confirms blocking and uses authoritative state, without optimistic follow restoration',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({changed:true})).mockResolvedValueOnce(Response.json({...profile,relationship:{following:false,followedBy:false,blockedByViewer:true,canMessage:false,messageDisabledReason:'blocked'}}));vi.stubGlobal('fetch',fetcher)
 render(<HumanProfilePanel initialProfile={profile} locale="en"/>)
 fireEvent.click(screen.getByRole('button',{name:'Block'}))
 expect(fetcher).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Confirm block'}))
 await screen.findByRole('button',{name:'Unblock'})
 expect(screen.getByRole('button',{name:'Chat'})).toBeDisabled()
 expect(screen.getByRole('button',{name:'Follow'})).toBeDisabled()
})
it('opens HUMAN chat in its own messages namespace',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({conversation:{id}})))
 render(<HumanProfilePanel initialProfile={profile} locale="en"/>)
 fireEvent.click(screen.getByRole('button',{name:'Chat'}))
 await waitFor(()=>expect(push).toHaveBeenCalledWith(`/en/messages?humanConversation=${id}`))
})
it('shows mutation failure without claiming a successful follow',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({changed:'yes'})))
 render(<HumanProfilePanel initialProfile={profile} locale="en"/>)
 fireEvent.click(screen.getByRole('button',{name:'Follow back'}))
 await screen.findByRole('alert')
 expect(screen.getByRole('button',{name:'Follow back'})).toHaveAttribute('aria-pressed','false')
})
it('all tabs keep their referenced panels mounted for assistive technology',()=>{
 render(<HumanProfilePanel initialProfile={profile} locale="en"/>)
 for(const tab of screen.getAllByRole('tab'))expect(document.getElementById(tab.getAttribute('aria-controls')!)).not.toBeNull()
})
