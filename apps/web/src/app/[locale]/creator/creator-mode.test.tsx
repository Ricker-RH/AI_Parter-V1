import {afterEach,describe,expect,it,vi} from 'vitest'

const {connection}=vi.hoisted(()=>({connection:vi.fn()}))

vi.mock('next/server',()=>({connection}))
vi.mock('next/navigation',()=>({notFound:vi.fn(()=>{throw new Error('NOT_FOUND')})}))

import CreatorPage from './page.js'
import CreatorDraftPage from './[draftId]/page.js'
import CreatorAdminPage from '../admin/creator/page.js'

afterEach(()=>{delete process.env.CREATOR_MODE_ENABLED;connection.mockReset()})

describe('creator page rollout gate',()=>{
  it.each([
    ['center',()=>CreatorPage({params:Promise.resolve({locale:'en'})})],
    ['draft',()=>CreatorDraftPage({params:Promise.resolve({locale:'en',draftId:'11111111-1111-4111-8111-111111111111'})})],
    ['admin',()=>CreatorAdminPage({params:Promise.resolve({locale:'en'})})],
  ])('hides the %s page when creator mode is disabled',async(_name,renderPage)=>{
    connection.mockResolvedValue(undefined)
    process.env.CREATOR_MODE_ENABLED='false'
    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
  })
})
