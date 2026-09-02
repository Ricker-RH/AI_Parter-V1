import {render,screen} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'

const {access}=vi.hoisted(()=>({access:vi.fn()}))
vi.mock('../../../lib/auth/access-policy.js',()=>({requireAuthenticatedPage:access}))
vi.mock('next/navigation',()=>({notFound:vi.fn()}))

import CreatorPage from './page.js'

describe('creator center page',()=>{
  beforeEach(()=>{
    access.mockReset().mockResolvedValue({status:'unavailable'})
  })

  it.each([
    {locale:'en' as const,labels:en.creator,href:'/en/profile'},
    {locale:'zh-CN' as const,labels:zh.creator,href:'/zh-CN/profile'},
  ])('keeps the localized creator header and safe exit when access is unavailable in $locale',async({locale,labels,href})=>{
    render(await CreatorPage({params:Promise.resolve({locale})}))

    expect(screen.getByRole('heading',{level:1,name:labels.title})).toBeVisible()
    expect(screen.getByRole('link',{name:labels.cancel})).toHaveAttribute('href',href)
    expect(screen.getByRole('link',{name:labels.cancel})).toHaveClass('creator-exit')
    expect(screen.getByRole('alert')).toHaveTextContent(labels.unavailable)
    expect(access).toHaveBeenCalledWith({locale,returnTo:`/${locale}/creator`})
  })
})
