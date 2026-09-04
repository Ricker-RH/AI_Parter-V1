import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {IpProfileShareAction} from './IpProfileShareAction.js'

vi.mock('../account/CurrentAccountProvider.js', () => ({useOptionalCurrentAccount: () => null}))

const profile = {id: '11111111-1111-4111-8111-111111111111', username: 'luna', displayName: 'Luna', bio: 'A calm IP', creator: undefined, kind: 'ip' as const, languages: ['en'] as ('en' | 'zh-CN')[], visualType: 'hybrid' as const}

describe('IpProfileShareAction', () => {
  it('keeps sharing behind the IP-only overflow action and opens an in-app sheet', () => {
    render(<IpProfileShareAction locale="en" profile={profile}/>)
    fireEvent.click(screen.getByRole('button', {name: 'More'}))
    fireEvent.click(screen.getByRole('menuitem', {name: 'Share'}))
    expect(screen.getByRole('dialog', {name: 'Share Luna'})).toBeVisible()
    expect(screen.getByText('Share to')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Copy link'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'System share'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Create share image'})).toBeVisible()
    expect(screen.getByText('No mutual friends to share with yet.')).toBeVisible()
  })
})
