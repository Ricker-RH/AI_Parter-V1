import {render} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

const {notFound} = vi.hoisted(() => ({notFound: vi.fn()}))
vi.mock('../../../../../components/chat/CachedNotificationsWorkspace.js', () => ({CachedNotificationsWorkspace: ({selectedId}: {selectedId?: string}) => <div data-notification-detail-route>{selectedId}</div>}))
vi.mock('next/navigation', () => ({notFound}))
import NotificationPage from './page.js'

const id = '66666666-6666-4666-8666-666666666666'

describe('canonical notification detail route', () => {
  it('renders the client-owned detail workspace', async () => {
    render(await NotificationPage({params: Promise.resolve({locale: 'en', notificationId: id}), searchParams: Promise.resolve({})}))
    expect(document.querySelector('[data-notification-detail-route]')).toHaveTextContent(id)
  })

  it('rejects malformed ids before rendering the workspace', async () => {
    await NotificationPage({params: Promise.resolve({locale: 'en', notificationId: 'bad'}), searchParams: Promise.resolve({})})
    expect(notFound).toHaveBeenCalled()
  })
})
