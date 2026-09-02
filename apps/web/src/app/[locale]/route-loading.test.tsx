import {render} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import SearchLoading from './search/loading.js'
import MessagesLoading from './messages/loading.js'
import MessageDetailLoading from './messages/[conversationId]/loading.js'
import ActivityLoading from './activity/loading.js'
import LikedLoading from './liked/loading.js'
import SavedLoading from './bookmarks/loading.js'
import NotificationsLoading from './notifications/loading.js'
import ProfileLoading from './profile/loading.js'
import PublicProfileLoading from './profiles/[profileId]/loading.js'
import SettingsLoading from './settings/loading.js'
import AuthLoading from './auth/[view]/loading.js'
import CreatorLoading from './creator/loading.js'
import CreatorDraftLoading from './creator/[draftId]/loading.js'

describe('content-shaped route loading boundaries', () => {
  it.each([
    ['search', SearchLoading, 'search'],
    ['messages', MessagesLoading, 'messages'],
    ['message detail', MessageDetailLoading, 'detail'],
    ['activity', ActivityLoading, 'list'],
    ['liked', LikedLoading, 'list'],
    ['saved', SavedLoading, 'list'],
    ['notifications', NotificationsLoading, 'list'],
    ['profile', ProfileLoading, 'profile'],
    ['public profile', PublicProfileLoading, 'profile'],
    ['settings', SettingsLoading, 'settings'],
    ['auth', AuthLoading, 'auth'],
    ['creator', CreatorLoading, 'settings'],
    ['creator draft', CreatorDraftLoading, 'settings'],
  ] as const)('uses a %s-specific skeleton', (_name, Loading, variant) => {
    const {container} = render(<Loading />)
    expect(container.querySelector(`.route-skeleton--${variant}`)).toBeTruthy()
  })
})
