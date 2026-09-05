import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {MessagesSectionHeader} from './MessagesSectionHeader'

describe('MessagesSectionHeader', () => {
  it.each(['chat', 'notifications'] as const)('keeps search space while %s content loads', active => {
    render(<MessagesSectionHeader active={active} locale="en" labels={{title:'Messages',chatTab:'Chats',notificationsTab:'Notifications',searchLabel:'Search messages',searchPlaceholder:'Search'}}/>)
    expect(screen.getByRole('searchbox', {name:'Search messages'})).toHaveAttribute('readonly')
    expect(screen.getByRole('heading', {name:'Messages'})).toBeVisible()
    expect(screen.getByRole('navigation')).toBeVisible()
  })
})
