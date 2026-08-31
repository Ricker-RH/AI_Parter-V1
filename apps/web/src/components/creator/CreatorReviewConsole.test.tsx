import {fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import en from '../../../messages/en.json'
import {CreatorReviewConsole} from './CreatorReviewConsole.js'

afterEach(()=>vi.unstubAllGlobals())

describe('CreatorReviewConsole',()=>{
  it('loads pending submissions and requests and exposes decisions without publishing controls',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({items:[],nextCursor:null})))
    render(<CreatorReviewConsole labels={en.creatorAdmin} />)
    expect(await screen.findByRole('heading',{name:'Creator review'})).toBeVisible()
    expect(screen.getByText('No submissions waiting.')).toBeVisible()
    expect(screen.getByText('No change requests waiting.')).toBeVisible()
    expect(screen.queryByRole('button',{name:/publish|operate/i})).toBeNull()
  })

  it('requires a rejection reason and sends only a bounded decision',async()=>{
    const references=['avatar','cover','portrait','full_body','supporting_1'].map((role,index)=>({id:`00000000-0000-4000-8000-00000000000${index}`,role}))
    const submission={id:'11111111-1111-4111-8111-111111111111',draftId:'22222222-2222-4222-8222-222222222222',revision:{id:'33333333-3333-4333-8333-333333333333',version:1,username:'luna_ip',displayName:'Luna',shortDescription:'',languageCodes:['en'],contentThemes:['art'],persona:{personality:'calm',background:'story',world:'earth',values:'care',tone:'warm',interests:[],boundaries:'safe',relationshipStyle:'kind'},visualType:'anime',appearance:'silver hair',references,createdAt:'2026-09-01T00:00:00.000Z'},state:'pending_review',ipProfileId:null,submittedAt:'2026-09-01T00:00:00.000Z',decidedAt:null,decisionReason:null}
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[submission],nextCursor:null})).mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({...submission,state:'rejected',decidedAt:'2026-09-01T00:01:00.000Z',decisionReason:'Incomplete'}))
    vi.stubGlobal('fetch',fetcher);render(<CreatorReviewConsole labels={en.creatorAdmin} />)
    expect(await screen.findByText('@luna_ip')).toBeVisible(); fireEvent.click(screen.getByRole('button',{name:'Reject'})); expect(await screen.findByRole('alert')).toHaveTextContent('A rejection reason is required.')
    fireEvent.change(screen.getByLabelText('Decision reason'),{target:{value:'Incomplete'}});fireEvent.click(screen.getByRole('button',{name:'Reject'}))
    expect(await screen.findByText('Review updated.')).toBeVisible()
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({decision:'reject',reason:'Incomplete'})
  })
})
