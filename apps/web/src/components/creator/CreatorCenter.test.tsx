import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import en from '../../../messages/en.json'
import {CreatorCenter} from './CreatorCenter.js'

afterEach(()=>vi.unstubAllGlobals())

describe('CreatorCenter',()=>{
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
})
