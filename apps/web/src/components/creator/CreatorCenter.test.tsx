import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import en from '../../../messages/en.json'
import zh from '../../../messages/zh-CN.json'
import {CreatorCenter} from './CreatorCenter.js'

const {replace,router}=vi.hoisted(()=>{const replace=vi.fn();return {replace,router:{replace}}})
vi.mock('next/navigation',()=>({useRouter:()=>router}))

afterEach(()=>{vi.unstubAllGlobals();replace.mockClear()})

describe('CreatorCenter',()=>{
  it.each([
    {locale:'en' as const,labels:en.creator,name:'Cancel',href:'/en/messages'},
    {locale:'zh-CN' as const,labels:zh.creator,name:'取消',href:'/zh-CN/channels'},
  ])('returns to the validated originating page in $locale',({locale,labels,name,href})=>{
    vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(()=>{})))

    render(<CreatorCenter labels={labels} locale={locale} returnTo={href} />)

    expect(screen.getByRole('link',{name})).toHaveAttribute('href',href)
    expect(screen.getByRole('link',{name})).toHaveClass('creator-exit')
  })

  it('keeps the creator exit and draft cancel actions distinct while editing',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({items:[],nextCursor:null}))
    vi.stubGlobal('fetch',fetcher)

    render(<CreatorCenter labels={en.creator} locale="en" />)

    fireEvent.click(await screen.findByRole('button',{name:'New identity'}))
    expect(screen.getByRole('link',{name:'Cancel'})).toHaveAttribute('href','/en/profile')
    const draftCancel=screen.getByRole('button',{name:'Cancel'})
    fireEvent.click(draftCancel)

    expect(screen.queryByRole('form',{name:'Identity draft'})).toBeNull()
    expect(screen.getByRole('link',{name:'Cancel'})).toHaveAttribute('href','/en/profile')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps the safe exit available when creator data cannot load',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')))

    render(<CreatorCenter labels={en.creator} locale="en" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(en.creator.unavailable)
    expect(screen.getByRole('link',{name:'Cancel'})).toHaveAttribute('href','/en/profile')
  })

  it('shows a polished real-data empty state and lets any signed-in human start a draft',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({id:'11111111-1111-4111-8111-111111111111'} ,{status:201}))
    vi.stubGlobal('fetch',fetcher)
    render(<CreatorCenter labels={en.creator} locale="en" />)
    expect(await screen.findByRole('heading',{name:'Create an AI/IP identity'})).toBeVisible()
    expect(screen.queryByText(/Luna/)).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'New identity'}))
    expect(screen.getByRole('form',{name:'Identity draft'})).toBeVisible()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio',{name:'Hybrid'})).toBeChecked()
  })

  it('renders existing drafts and creator IP analytics links without management or publish controls',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({items:[{id:'11111111-1111-4111-8111-111111111111',username:'luna_ip',displayName:'Luna',shortDescription:'',languageCodes:['en'],contentThemes:['art'],persona:{personality:'calm',background:'story',world:'earth',values:'care',tone:'warm',interests:[],boundaries:'safe',relationshipStyle:'kind'},visualType:'hybrid',appearance:'silver hair',status:'draft',references:[],createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z'}],nextCursor:null})).mockResolvedValueOnce(Response.json({items:[],nextCursor:null})))
    render(<CreatorCenter labels={en.creator} locale="en" />)
    expect(await screen.findByRole('link',{name:/Luna/})).toHaveAttribute('href','/en/creator/11111111-1111-4111-8111-111111111111')
    expect(screen.queryByRole('button',{name:/publish|operate/i})).toBeNull()
  })

  it('uses explicit save and reports safe localized failures',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({items:[],nextCursor:null})).mockResolvedValueOnce(Response.json({code:'CREATOR_CONFLICT'},{status:409}))
    vi.stubGlobal('fetch',fetcher)
    render(<CreatorCenter labels={en.creator} locale="en" />)
    await screen.findByRole('heading',{name:'Create an AI/IP identity'}); fireEvent.click(screen.getByRole('button',{name:'New identity'}))
    fireEvent.change(screen.getByLabelText('Username'),{target:{value:'luna_ip'}})
    fireEvent.change(screen.getByLabelText('Display name'),{target:{value:'Luna'}})
    fireEvent.change(screen.getByLabelText('Content themes (comma-separated)'),{target:{value:'art'}})
    fireEvent.change(screen.getByLabelText('Personality'),{target:{value:'Calm'}})
    fireEvent.change(screen.getByLabelText('Background'),{target:{value:'A long story'}})
    fireEvent.change(screen.getByLabelText('World'),{target:{value:'Earth'}})
    fireEvent.change(screen.getByLabelText('Values'),{target:{value:'Care'}})
    fireEvent.change(screen.getByLabelText('Tone'),{target:{value:'Warm'}})
    fireEvent.change(screen.getByLabelText('Boundaries'),{target:{value:'Safe'}})
    fireEvent.change(screen.getByLabelText('Relationship style'),{target:{value:'Kind'}})
    fireEvent.change(screen.getByLabelText('Appearance'),{target:{value:'Silver hair'}})
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('The draft could not be saved.')
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3))
  })

  it('replaces a stale creator session with the validated creator return target after a 401',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({code:'AUTH_REQUIRED'},{status:401})))
    render(<CreatorCenter labels={en.creator} locale="en" />)
    await waitFor(()=>expect(replace).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fcreator'))
  })

  it('redirects only once when concurrent creator requests find a stale session',async()=>{
    const references=['avatar','cover','portrait','full_body','supporting_1'].map((role,index)=>({id:`00000000-0000-4000-8000-00000000000${index}`,role}))
    const identity=(id:string,username:string,displayName:string)=>({id,username,displayName,shortDescription:'',languageCodes:['en'],contentThemes:['art'],visualType:'hybrid',status:'approved',operationEnabled:false,creator:{id:'99999999-9999-4999-8999-999999999999',username:'owner',displayName:'Owner'},references,createdAt:'2026-09-01T00:00:00.000Z'})
    vi.stubGlobal('fetch',vi.fn()
      .mockResolvedValueOnce(Response.json({items:[],nextCursor:null}))
      .mockResolvedValueOnce(Response.json({items:[identity('11111111-1111-4111-8111-111111111111','luna_ip','Luna'),identity('22222222-2222-4222-8222-222222222222','nova_ip','Nova')],nextCursor:null}))
      .mockResolvedValue(new Response(null,{status:401})))

    render(<CreatorCenter labels={en.creator} locale="en" />)

    await waitFor(()=>expect(replace).toHaveBeenCalledTimes(1))
  })
})
