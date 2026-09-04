import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {HumanAuthorPreview} from './HumanAuthorPreview'
const id='11111111-1111-4111-8111-111111111111'
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()})}))
afterEach(()=>vi.unstubAllGlobals())
it('preloads a human profile on avatar intent before opening its card',async()=>{
 const profile={v:1 as const,identity:{kind:'HUMAN' as const,id,username:'rui',displayName:'Current Rui',avatarUrl:null},bio:'Current bio',background:{type:'color' as const,colorKey:'paper'},followerCount:12,isOwner:false,visibility:'private' as const,tabs:{ips:{state:'locked' as const},liked:{state:'locked' as const},saved:{state:'locked' as const},following:{state:'locked' as const}},relationship:{following:false,followedBy:true,blockedByViewer:false,canMessage:true,messageDisabledReason:null}}
 const request=vi.fn().mockResolvedValue(Response.json(profile));vi.stubGlobal('fetch',request)
 render(<HumanAuthorPreview human={{id,displayName:'Old Rui',avatarUrl:null}} locale="en"/>)
 const trigger=screen.getByRole('button',{name:'Profile: Old Rui'});fireEvent.pointerEnter(trigger)
 await waitFor(()=>expect(request).toHaveBeenCalledWith(`/api/humans/${id}`,expect.objectContaining({credentials:'same-origin'})))
 fireEvent.click(trigger)
 expect(await screen.findByText('Current bio')).toBeInTheDocument()
 expect(screen.queryByRole('status')).toBeNull()
})
it('loads current identity on avatar preview, links HUMAN route and restores focus on Escape',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({v:1,identity:{kind:'HUMAN',id,username:'rui',displayName:'Current Rui',avatarUrl:'https://media.test/current.webp'},bio:'Current bio',background:{type:'color',colorKey:'paper'},followerCount:12,isOwner:false,visibility:'private',tabs:{ips:{state:'locked'},liked:{state:'locked'},saved:{state:'locked'},following:{state:'locked'}},relationship:{following:false,followedBy:true,blockedByViewer:false,canMessage:true,messageDisabledReason:null}})))
 render(<HumanAuthorPreview human={{id,displayName:'Old Rui',avatarUrl:null}} locale="en"/>)
 const trigger=screen.getByRole('button',{name:'Profile: Old Rui'});fireEvent.click(trigger)
 const dialog=screen.getByRole('dialog')
 expect(await within(dialog).findByText('Current bio')).toBeInTheDocument()
 expect(within(dialog).getByRole('link',{name:'Current Rui'})).toHaveAttribute('href',`/en/humans/${id}`)
 expect(within(dialog).getByRole('button',{name:'Follow back'})).toBeInTheDocument()
 expect(within(dialog).getByRole('button',{name:'Chat'})).toBeInTheDocument()
 expect(within(dialog).getByText('12 followers')).toBeInTheDocument()
 expect(within(dialog).queryByRole('button',{name:'Block'})).toBeNull()
 expect(within(dialog).queryByRole('button',{name:'Close'})).toBeNull()
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(trigger).toHaveFocus()
})
