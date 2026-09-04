import {fireEvent, render, screen} from '@testing-library/react'
import {expect, it, vi} from 'vitest'
import {HumanProfileBlockMenu} from './HumanProfileBlockMenu.js'

const profile = {v: 1 as const, identity: {kind: 'HUMAN' as const, id: '11111111-1111-4111-8111-111111111111', displayName: 'Rui', username: 'rui', avatarUrl: null}, bio: null, background: {type: 'color' as const, colorKey: 'paper' as const}, followerCount: 0, visibility: 'private' as const, isOwner: false, relationship: {following: false, followedBy: false, blockedByViewer: false, canMessage: false, messageDisabledReason: 'mutual_follow_required' as const}, tabs: {ips: {state: 'locked' as const}, liked: {state: 'locked' as const}, saved: {state: 'locked' as const}, following: {state: 'locked' as const}}}

it('keeps the human block control within its local overflow menu', () => {
  render(<HumanProfileBlockMenu locale="en" onProfileChange={vi.fn()} profile={profile}/>)
  expect(screen.queryByRole('menuitem', {name: 'Block'})).toBeNull()
  fireEvent.click(screen.getByRole('button', {name: 'More'}))
  expect(screen.getByRole('menuitem', {name: 'Block'})).toBeVisible()
})
