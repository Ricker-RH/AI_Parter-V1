import {render, screen} from '@testing-library/react'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next/link', () => ({default: ({children, ...props}: {children: React.ReactNode; [key: string]: unknown}) => <a data-next-link="true" {...props}>{children}</a>}))

import {ActivityTabs} from './ActivityTabs.js'

const moduleUrl = import.meta.url
const stylesheet = readFileSync(fileURLToPath(new URL('./ActivityTabs.module.css', moduleUrl)), 'utf8')

describe('ActivityTabs', () => {
  it('uses Next links for the compact Liked and Saved collection destinations', () => {
    render(<ActivityTabs labels={{collections: 'Collections', bookmarks: 'Saved', liked: 'Liked'}} locale="en" selected="liked" />)

    expect(screen.getByRole('link', {name: 'Liked'})).toHaveAttribute('data-next-link', 'true')
    expect(screen.getByRole('link', {name: 'Liked'})).toHaveAttribute('href', '/en/activity?tab=liked')
    expect(screen.getByRole('link', {name: 'Saved'})).toHaveAttribute('data-next-link', 'true')
    expect(screen.queryByRole('link', {name: 'Notifications'})).toBeNull()
  })

  it('uses separate subtle 44px pills instead of a heavy segmented control', () => {
    expect(stylesheet).toMatch(/\.tabs\s*\{[^}]*border-bottom:\s*0/s)
    expect(stylesheet).toMatch(/\.list\s*\{[^}]*gap:\s*8px/s)
    expect(stylesheet).toMatch(/\.tab\s*\{[^}]*border:\s*1px solid var\(--shell-border\)[^}]*min-height:\s*44px/s)
    expect(stylesheet).toMatch(/\.tab\[aria-current='page'\]\s*\{[^}]*background:\s*var\(--shell-hover\)[^}]*color:\s*var\(--shell-text\)/s)
    expect(stylesheet).not.toMatch(/\.list\s*\{[^}]*border:\s*1px solid/s)
  })
})
