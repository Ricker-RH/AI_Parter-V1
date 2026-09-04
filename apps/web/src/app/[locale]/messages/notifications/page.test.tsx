import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('../../../../components/chat/CachedNotificationsWorkspace.js', () => ({CachedNotificationsWorkspace: ({locale}: {locale: string}) => <div data-notification-route>{locale}</div>}))
import NotificationsPage from './page.js'

describe('canonical notification list route', () => {
  it('renders the client-owned notification workspace without server data reads', async () => {
    render(await NotificationsPage({params: Promise.resolve({locale: 'en'}), searchParams: Promise.resolve({})}))
    expect(document.querySelector('[data-notification-route]')).toHaveTextContent('en')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
