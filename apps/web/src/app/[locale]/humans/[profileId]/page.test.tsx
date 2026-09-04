import {expect,it,vi} from 'vitest'
import {render,screen} from '@testing-library/react'
import Page from './page'
import {fetchAifansApi} from '../../../../lib/server-api'
vi.mock('../../../../lib/server-api',()=>({fetchAifansApi:vi.fn()}))
vi.mock('../../../../lib/auth/access-policy',()=>({requireAuthenticatedPage:vi.fn().mockResolvedValue({status:'ok',token:'server-token',viewerScope:'viewer'}),redirectToUserSignIn:vi.fn()}))
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND')},redirect:vi.fn()}))
it('fetches HUMAN profile with viewer token and renders recoverable failure',async()=>{
 vi.mocked(fetchAifansApi).mockResolvedValue(Response.json({code:'HUMAN_SOCIAL_NOT_CONFIGURED'},{status:503}))
 render(await Page({params:Promise.resolve({locale:'en',profileId:'11111111-1111-4111-8111-111111111111'})}))
 expect(screen.getByRole('alert')).toHaveTextContent('could not')
 expect(fetchAifansApi).toHaveBeenCalledWith('/v1/humans/11111111-1111-4111-8111-111111111111',expect.objectContaining({policy:'live-no-store',getToken:expect.any(Function)}))
})
