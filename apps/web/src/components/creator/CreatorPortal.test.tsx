import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {CreatorPortal} from './CreatorPortal'
import {CreatorCenter} from './CreatorCenter'
import {CreatorImages} from './CreatorImages'
import en from '../../../messages/en.json'
import {readFileSync,writeFileSync} from 'node:fs'
import styles from './CreatorPortal.module.css'

const {router}=vi.hoisted(()=>({router:{replace:vi.fn()}}))
vi.mock('next/navigation',()=>({useRouter:()=>router}))
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
function writeLayout(name:string,container:HTMLElement) {
  if(process.env.CREATOR_LAYOUT_FIXTURE!=='1')return
  const globalCss=readFileSync('apps/web/src/app/globals.css','utf8').replace(/^@import[^;]+;/gm,'')
  const componentCss=readFileSync('apps/web/src/components/creator/CreatorPortal.module.css','utf8').replace(/\.([a-zA-Z][\w-]*)/g,(match,key)=>styles[key]?`.${styles[key]}`:match)
  writeFileSync(`/tmp/aifans-creator-${name}.html`,`<!doctype html><html lang="en" data-route-shell="creator"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalCss}\n${componentCss}</style><body><div class="creator-shell"><div class="shell" data-shell="public" data-mobile-top-bar="hidden"><aside class="desktop-nav">AIFANS</aside><div class="content">${container.innerHTML}</div><nav class="mobile-nav"><a class="mobile-link">Home</a><a class="mobile-link">Channels</a><a class="mobile-link">Messages</a><a class="mobile-link">Profile</a></nav></div></div></body></html>`)
}
describe('Creator destinations',()=>{
  it('opens distinct routes without a gallery or fetching drafts on the portal',()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
    const {container}=render(<CreatorPortal locale="en" returnTo="/en/messages"/>)
    expect(screen.getByRole('link',{name:'Back'})).toHaveAttribute('href','/en/messages')
    expect(screen.getByRole('link',{name:/Get started/})).toHaveAttribute('href','/en/creator/studio')
    expect(screen.getByRole('link',{name:/Generate images/})).toHaveAttribute('href','/en/creator/images')
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.queryByRole('img')).toBeNull()
    writeLayout('portal',container)
    if(process.env.CREATOR_LAYOUT_FIXTURE==='1') {
      const globalCss=readFileSync('apps/web/src/app/globals.css','utf8').replace(/^@import[^;]+;/gm,'')
      const componentCss=readFileSync('apps/web/src/components/creator/CreatorPortal.module.css','utf8').replace(/\.([a-zA-Z][\w-]*)/g,(match,key)=>styles[key]?`.${styles[key]}`:match)
      writeFileSync('/tmp/aifans-creator-layout.html',`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalCss}\n${componentCss}</style><body><div class="creator-shell"><div class="shell" data-shell="public" data-mobile-top-bar="hidden"><aside class="desktop-nav">AIFANS</aside><div class="content">${container.innerHTML}</div><nav class="mobile-nav"><a class="mobile-link">Home</a><a class="mobile-link">Channels</a><a class="mobile-link">Messages</a><a class="mobile-link">Profile</a></nav></div></div></body></html>`)
    }
  })
  it('preserves in-progress creation when switching and keyboard navigating tabs',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(Response.json({items:[],nextCursor:null}))))
    const {container}=render(<CreatorCenter workspace locale="en" labels={en.creator}/>)
    fireEvent.change(screen.getByLabelText('Describe your IP'),{target:{value:'My character'}})
    expect(screen.getByRole('radio',{name:'Private'})).toBeChecked()
    fireEvent.click(screen.getByRole('radio',{name:'Public'}))
    fireEvent.click(screen.getByRole('tab',{name:'Drafts'}))
    expect(await screen.findByText('Your saved drafts will appear here.')).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.keyDown(screen.getByRole('tab',{name:'Drafts'}),{key:'ArrowLeft'})
    expect(screen.getByLabelText('Describe your IP')).toHaveValue('My character')
    expect(screen.getByRole('radio',{name:'Public'})).toBeChecked()
    expect(screen.getByText('Public IPs require approval before they can be visible to others.')).toBeVisible()
    writeLayout('studio',container)
  })
  it('provides a real creation path when no draft is available for image generation',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({items:[],nextCursor:null})))
    const {container}=render(<CreatorImages locale="en"/>)
    expect(await screen.findByRole('link',{name:/Create and save/})).toHaveAttribute('href','/en/creator/studio')
    expect(screen.queryByRole('button',{name:'Generate images'})).toBeNull()
    writeLayout('images',container)
  })
  it('redirects expired image sessions without showing success',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({},{status:401})))
    render(<CreatorImages locale="en"/>)
    await waitFor(()=>expect(router.replace).toHaveBeenCalledWith('/en/auth/sign-in?next=%2Fen%2Fcreator%2Fimages'))
  })
  it.each(['queued','unavailable'] as const)('handles %s generation without false image results',async(outcome)=>{
    const draft={id:'11111111-1111-4111-8111-111111111111',username:'sample_ip',displayName:'Sample',shortDescription:'',languageCodes:['en'],contentThemes:['art'],persona:{personality:'calm',background:'story',world:'earth',values:'care',tone:'warm',interests:[],boundaries:'safe',relationshipStyle:'kind'},visualType:'hybrid',appearance:'silver hair',status:'draft',references:[],createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z'}
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[draft],nextCursor:null})).mockResolvedValueOnce(outcome==='queued'?Response.json({jobId:draft.id,status:'queued',candidates:[]}):Response.json({code:'IMAGE_GENERATION_NOT_CONFIGURED'},{status:503}))
    vi.stubGlobal('fetch',fetcher)
    render(<CreatorImages locale="en"/>)
    fireEvent.click(await screen.findByRole('button',{name:'Generate images'}))
    await screen.findByText(outcome==='queued'?'Your generation is queued. Images are not available yet; please do not resubmit.':'Image generation is not available yet. Please try again later.')
    expect(screen.getByRole('button',{name:'Generate images'})).toBeDisabled()
    expect(screen.queryByRole('img')).toBeNull()
    expect(fetcher).toHaveBeenLastCalledWith(`/api/creator/drafts/${draft.id}/generation-intent`,expect.objectContaining({method:'POST',body:'{}'}))
  })
})
