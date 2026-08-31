import {fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import en from '../../../messages/en.json'
import type {CreatorDraft} from './types.js'
import {CreatorDraftForm} from './CreatorDraftForm.js'

afterEach(()=>vi.unstubAllGlobals())
const id='11111111-1111-4111-8111-111111111111'
const draft:CreatorDraft={id,username:'luna_ip',displayName:'Luna',shortDescription:'',languageCodes:['en'],contentThemes:['art'],persona:{personality:'calm',background:'story',world:'earth',values:'care',tone:'warm',interests:[],boundaries:'safe',relationshipStyle:'kind'},visualType:'realistic',appearance:'silver hair',status:'draft',references:[],createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z'}

describe('CreatorDraftForm',()=>{
  it('keeps generation honest when unconfigured and uploads through intent then registration',async()=>{
    vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:1024,height:768,close:vi.fn()}))
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({code:'IMAGE_GENERATION_NOT_CONFIGURED'},{status:503})).mockResolvedValueOnce(Response.json({assetId:id,method:'PUT',url:'https://upload.example',headers:{'content-type':'image/png'},expiresAt:'2026-09-01T00:05:00.000Z',maxBytes:10485760},{status:201})).mockResolvedValueOnce(new Response(null,{status:200})).mockResolvedValueOnce(Response.json({assetId:id,created:true},{status:201}))
    vi.stubGlobal('fetch',fetcher)
    render(<CreatorDraftForm draft={draft} labels={en.creator} locale="en" />)
    fireEvent.click(screen.getByRole('button',{name:'Generate references'}))
    expect(await screen.findByText('Image generation is not configured yet.')).toBeVisible()
    const file=new File(['image'],'reference.png',{type:'image/png'}); fireEvent.change(screen.getByLabelText('Upload reference image'),{target:{files:[file]}})
    expect(await screen.findByText('1 of 8 references')).toBeVisible()
  })

  it('requires authorization acceptance and five unique reference roles before submit',async()=>{
    render(<CreatorDraftForm draft={draft} labels={en.creator} locale="en" />)
    expect(screen.getByRole('button',{name:'Submit for review'})).toBeDisabled()
    expect(screen.getByLabelText('I accept the operating authorization')).not.toBeChecked()
  })

  it('is read-only after submission',()=>{
    render(<CreatorDraftForm draft={{...draft,status:'submitted'}} labels={en.creator} locale="en" />)
    expect(screen.getByText('Submitted drafts are read-only.')).toBeVisible()
    expect(screen.queryByRole('button',{name:'Save draft'})).toBeNull()
  })
})
