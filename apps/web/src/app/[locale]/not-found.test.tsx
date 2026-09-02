import {render, screen} from '@testing-library/react'
import type {AnchorHTMLAttributes, ReactNode} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import NotFound from './not-found.js'

const pathname = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({usePathname: pathname}))
vi.mock('next/link', () => ({default: ({children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {children: ReactNode}) => <a {...props}>{children}</a>}))

describe('localized not-found page', () => {
  beforeEach(() => pathname.mockReturnValue('/en/missing'))

  it('renders a branded English 404 with a safe Home route', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', {name: 'Page not found'})).toBeVisible()
    expect(screen.getByRole('img', {name: 'AIFANS'})).toBeVisible()
    expect(screen.getByRole('link', {name: 'Return home'})).toHaveAttribute('href', '/en')
  })

  it('renders Chinese copy without leaking the missing URL', () => {
    pathname.mockReturnValue('/zh-CN/private/internal-path')
    render(<NotFound />)
    expect(screen.getByRole('heading', {name: '找不到页面'})).toBeVisible()
    expect(screen.getByRole('link', {name: '返回首页'})).toHaveAttribute('href', '/zh-CN')
    expect(screen.queryByText(/private\/internal-path/)).not.toBeInTheDocument()
  })
})
