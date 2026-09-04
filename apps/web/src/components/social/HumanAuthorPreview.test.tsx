import {fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {HumanAuthorPreview} from './HumanAuthorPreview'
const id='11111111-1111-4111-8111-111111111111'
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()})}))
afterEach(()=>vi.unstubAllGlobals())
it('loads current identity on avatar preview, links HUMAN route and restores focus on Escape',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({v:1,identity:{kind:'HUMAN',id,username:'rui',displayName:'Current Rui',avatarUrl:'https://media.test/current.webp'},bio:'Current bio',background:{type:'color',colorKey:'paper'},isOwner:false,visibility:'private',tabs:{ips:{state:'locked'},liked:{state:'locked'},saved:{state:'locked'},following:{state:'locked'}},relationship:{following:false,followedBy:true,blockedByViewer:false,canMessage:true,messageDisabledReason:null}})))
 render(<HumanAuthorPreview human={{id,displayName:'Old Rui',avatarUrl:null}} locale="en"/>)
 const trigger=screen.getByRole('button',{name:'Profile: Old Rui'});fireEvent.click(trigger)
 const dialog=screen.getByRole('dialog')
 expect(await within(dialog).findByText('Current bio')).toBeInTheDocument()
 expect(within(dialog).getByRole('link',{name:'Current Rui'})).toHaveAttribute('href',`/en/humans/${id}`)
 expect(within(dialog).getByRole('button',{name:'Follow back'})).toBeInTheDocument()
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(trigger).toHaveFocus()
})
