import {fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import en from '../../../messages/en.json'
import zh from '../../../messages/zh-CN.json'
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

  it('renders a localized current-versus-proposed comparison with safe identity details',async()=>{
    const references=['avatar','cover','portrait','full_body','supporting_1'].map((role,index)=>({id:`00000000-0000-4000-8000-00000000000${index}`,role}))
    const revision={id:'33333333-3333-4333-8333-333333333333',version:2,username:'luna_ip',displayName:'新 Luna',shortDescription:'新简介',languageCodes:['zh-CN'],contentThemes:['艺术'],persona:{personality:'安静',background:'背景',world:'世界',values:'关怀',tone:'温暖',interests:['绘画'],boundaries:'安全',relationshipStyle:'友善'},visualType:'anime',appearance:'银发',references,createdAt:'2026-09-01T00:00:00.000Z'}
    const request={id:'11111111-1111-4111-8111-111111111111',ipProfileId:'22222222-2222-4222-8222-222222222222',kind:'change',reason:'需要更新当前身份资料',state:'pending',proposedRevision:revision,createdAt:'2026-09-01T00:00:00.000Z',decidedAt:null,decisionReason:null}
    const current={profile:{kind:'ip',id:request.ipProfileId,username:'luna_ip',displayName:'Luna',bio:'当前简介',languages:['en'],visualType:'realistic'},followerCount:0,posts:{items:[],nextCursor:null}}
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({items:[request],nextCursor:null})).mockResolvedValueOnce(Response.json(current)))
    render(<CreatorReviewConsole labels={zh.creatorAdmin} />)
    expect(await screen.findByText('当前公开身份')).toBeVisible()
    expect(await screen.findByText('新 Luna')).toBeVisible()
    expect(screen.getAllByText('视觉类型')).toHaveLength(2)
    expect(screen.getAllByText('语言')).toHaveLength(2)
    expect(screen.getByText('内容主题')).toBeVisible()
    expect(screen.getByText('角色设定')).toBeVisible()
    expect(screen.getByText('外观')).toBeVisible()
    expect(screen.queryByText(/^(Visual|Languages|Themes|Appearance|Submission|Request)$/)).toBeNull()
  })
})
