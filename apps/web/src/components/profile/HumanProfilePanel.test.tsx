import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {afterEach, expect, it, vi} from 'vitest'
import type {HumanProfile} from '@aifans/contracts'
import {HumanProfilePanel as Panel} from './HumanProfilePanel'
import messages from '../../../messages/en.json'
import {AppQueryContext} from '../AppQueryProvider'
function HumanProfilePanel(props:Omit<Parameters<typeof Panel>[0],'socialLabels'>){return <Panel {...props} socialLabels={messages}/>}

const push = vi.fn()
vi.mock('next/navigation', () => ({useRouter: () => ({push, replace:vi.fn(), refresh:vi.fn()}), usePathname:()=>'/en/humans/peer'}))
vi.mock('../GlobalMoreMenu',()=>({GlobalMoreMenu:()=>null}))
const id='11111111-1111-4111-8111-111111111111'
export const profile: HumanProfile={v:1,identity:{kind:'HUMAN',id,displayName:'Rui',username:'rui',avatarUrl:null},bio:'Hello there',background:{type:'color',colorKey:'paper'},followerCount:0,visibility:'private',isOwner:false,relationship:{following:false,followedBy:true,blockedByViewer:false,canMessage:true,messageDisabledReason:null},tabs:{ips:{state:'locked'},liked:{state:'locked'},saved:{state:'locked'},following:{state:'locked'}}}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
it('uses the author-card cache for the initial human relationship state',()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 client.setQueryData(['human-profile-preview','viewer-a',id],{...profile,bio:'Cached profile',relationship:{...profile.relationship,following:true}})
 render(<QueryClientProvider client={client}><AppQueryContext.Provider value><HumanProfilePanel initialProfile={profile} locale="en" viewerScope="viewer-a"/></AppQueryContext.Provider></QueryClientProvider>)
 expect(screen.getByText('Cached profile')).toBeVisible()
 expect(screen.getByRole('button',{name:'Following'})).toBeVisible()
})

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
it('uses only visitor content endpoints for a public visitor',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({state:'ready',tab:'ips',items:[],nextCursor:null}));vi.stubGlobal('fetch',fetcher)
 render(<HumanProfilePanel initialProfile={{...profile,visibility:'public',tabs:{ips:{state:'available'},liked:{state:'available'},saved:{state:'available'},following:{state:'available'}}}} locale="en"/>)
 expect(await screen.findByText('No content yet.')).toBeVisible()
 expect(fetcher).toHaveBeenCalledWith(`/api/humans/${id}/tabs/ips?limit=20`,expect.anything())
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
 expect(screen.queryByRole('button',{name:'Block'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'More'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'Block'}))
 expect(fetcher).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Confirm block'}))
 await waitFor(() => expect(screen.getByRole('button',{name:'More'})).toHaveAttribute('aria-expanded','false'))
 fireEvent.click(screen.getByRole('button',{name:'More'}))
 expect(screen.getByRole('menuitem',{name:'Unblock'})).toBeVisible()
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
it('applies a fresh server profile when privacy changes on the same route',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({state:'ready',tab:'ips',items:[],nextCursor:null})))
 const view=render(<HumanProfilePanel initialProfile={{...profile,visibility:'public',tabs:{ips:{state:'available'},liked:{state:'available'},saved:{state:'available'},following:{state:'available'}}}} locale="en"/>)
 await screen.findByText('No content yet.')
 view.rerender(<HumanProfilePanel initialProfile={profile} locale="en"/>)
 expect(await screen.findByText(/This profile is private/)).toBeVisible()
})

it('renders a visitor cover through the header and tabs even when content is private', () => {
 const rect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this: HTMLElement){
  return new DOMRect(0,0,390,this.getAttribute('role')==='tablist'?300:56)
 })
 try {
  const {container}=render(<HumanProfilePanel initialProfile={{...profile,background:{type:'image',url:'https://media.example/peer-cover.webp',focalX:.5,focalY:.5}}} locale="en"/>)
  const background=container.querySelector<HTMLElement>('[data-profile-background]')!
  expect(background).toHaveStyle({'--profile-background-image':'url("https://media.example/peer-cover.webp")'})
  expect(background.parentElement).toHaveStyle({height:'300px'})
  const host=background.parentElement!.parentElement!
  expect(host.querySelector(':scope > header')).not.toBeNull()
  expect(host.querySelector(':scope > [data-profile-cover-surface]')).not.toBeNull()
 } finally {rect.mockRestore()}
})
