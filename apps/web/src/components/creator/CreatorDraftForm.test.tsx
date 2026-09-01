import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import en from '../../../messages/en.json'
import type {CreatorDraft} from './types.js'
import {CreatorDraftForm} from './CreatorDraftForm.js'

const {replace,router}=vi.hoisted(()=>{const replace=vi.fn();return {replace,router:{replace}}})
vi.mock('next/navigation',()=>({useRouter:()=>router}))

afterEach(()=>{vi.unstubAllGlobals();replace.mockClear()})
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
    const duplicateReferences=Array.from({length:5},(_,index)=>({id:`00000000-0000-4000-8000-00000000000${index}`,role:'avatar' as const}))
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({url:'https://read.example'})))
    const {unmount}=render(<CreatorDraftForm draft={{...draft,references:duplicateReferences}} labels={en.creator} locale="en" />)
    fireEvent.click(screen.getByLabelText('I accept the operating authorization'))
    expect(screen.getByRole('button',{name:'Submit for review'})).toBeDisabled()
    const validReferences=duplicateReferences.map((reference,index)=>({...reference,role:(['avatar','cover','portrait','full_body','supporting_1'] as const)[index]!}))
    unmount();render(<CreatorDraftForm draft={{...draft,references:validReferences}} labels={en.creator} locale="en" />)
    fireEvent.click(screen.getByLabelText('I accept the operating authorization'))
    expect(screen.getByRole('button',{name:'Submit for review'})).toBeEnabled()
  })

  it('is read-only after submission',()=>{
    render(<CreatorDraftForm draft={{...draft,status:'submitted'}} labels={en.creator} locale="en" />)
    expect(screen.getByText('Submitted drafts are read-only.')).toBeVisible()
    expect(screen.queryByRole('button',{name:'Save draft'})).toBeNull()
  })

  it('replaces a stale draft session with its validated draft return target',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:401})))
    render(<CreatorDraftForm draft={draft} labels={en.creator} locale="en" />)
    fireEvent.click(screen.getByRole('button',{name:'Generate references'}))

    await waitFor(()=>expect(replace).toHaveBeenCalledWith(`/en/auth/sign-in?next=${encodeURIComponent(`/en/creator/${id}`)}`))
  })

  it('does not refetch a reference preview when changing that reference role',async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({url:'https://read.example'}))
    vi.stubGlobal('fetch',fetcher)
    render(<CreatorDraftForm draft={{...draft,references:[{id:'22222222-2222-4222-8222-222222222222',role:'avatar'}]}} labels={en.creator} locale="en" />)
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('1 of 8 references Request type'),{target:{value:'cover'}})

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('redirects only once when concurrent reference previews find a stale session',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:401})))
    render(<CreatorDraftForm draft={{...draft,references:[{id:'22222222-2222-4222-8222-222222222222',role:'avatar'},{id:'33333333-3333-4333-8333-333333333333',role:'cover'}]}} labels={en.creator} locale="en" />)

    await waitFor(()=>expect(replace).toHaveBeenCalledTimes(1))
  })
})
