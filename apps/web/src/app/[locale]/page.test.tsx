import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {rootLocale} = vi.hoisted(() => ({rootLocale: vi.fn(async () => 'en')}))
vi.mock('next/root-params', () => ({locale: rootLocale}))
vi.mock('../../components/social/CachedHomeRoute.js', () => ({CachedHomeRoute: ({locale}: {locale: string}) => <div data-home-route>{locale}</div>}))

import {getMessages} from '../../i18n/config.js'
import {HomeQueryContent, LocalizedHomePage} from './page.js'

describe('home route', () => {
  beforeEach(() => rootLocale.mockReset().mockResolvedValue('en'))

  it('renders a client-owned feed route without a server feed request', async () => {
    render(await HomeQueryContent({locale: 'en', messages: await getMessages('en'), searchParams: Promise.resolve({feed: 'following'})}))
    expect(document.querySelector('[data-home-route]')).toHaveTextContent('en')
  })

  it('rejects an unsupported locale', async () => {
    rootLocale.mockResolvedValue('unsupported')
    await expect(LocalizedHomePage({searchParams: Promise.resolve({})})).rejects.toThrow()
  })
})
