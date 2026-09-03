import {render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {describe, expect, it, vi} from 'vitest'
import en from '../../messages/en.json'
import zhCN from '../../messages/zh-CN.json'
import {FloatingCreatorAction} from './FloatingCreatorAction.js'

vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a {...props}>{children}</a>}))

describe('FloatingCreatorAction', () => {
  it.each([
    ['en', en, '/en/creator'],
    ['zh-CN', zhCN, '/zh-CN/creator'],
  ] as const)('links to the localized creator route for %s', (locale, labels, href) => {
    render(<FloatingCreatorAction label={labels.creatorCenter} locale={locale} />)
    expect(screen.getByRole('link', {name: labels.creatorCenter})).toHaveAttribute('href', href)
  })

  it('anchors the 52px circle inside the content frame without reserving a blank mobile strip', () => {
    const css = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
    expect(css).toMatch(/\.content\s*\{[^}]*position:\s*relative/)
    expect(css).toMatch(/\.floating-creator-action\s*\{[^}]*bottom:\s*24px[^}]*position:\s*absolute[^}]*height:\s*52px[^}]*min-height:\s*44px[^}]*width:\s*52px/)
    expect(css).toMatch(/\.floating-creator-action\s*\{[^}]*border-radius:\s*50%/)
    expect(css).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.mobile-nav \{[^}]*grid-template-columns:\s*repeat\(4, 1fr\)/)
    expect(css).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.shell\[data-shell="public"\] \.floating-creator-action \{[^}]*bottom:\s*16px/)
    expect(css).not.toMatch(/\.shell\[data-floating-creator-action="visible"\] \.content \{[^}]*padding-bottom/)
  })
})
