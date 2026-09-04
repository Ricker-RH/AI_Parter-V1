import {QueryClient, useQueryClient} from '@tanstack/react-query'
import {render, waitFor} from '@testing-library/react'
import {useEffect} from 'react'
import {expect, it} from 'vitest'
import {HumanChatQueryProvider} from './HumanChatQueryProvider.js'

const profileA = '11111111-1111-4111-8111-111111111111'
const profileB = '22222222-2222-4222-8222-222222222222'

function Seed({profileId}: {profileId: string}) {
  const client = useQueryClient()
  useEffect(() => {
    client.setQueryData(['human-chat', profileId, 'inbox'], {profileId})
  }, [client, profileId])
  return null
}

it('removes the previous profile private cache before rendering the next profile', async () => {
  const client = new QueryClient()
  const view = render(<HumanChatQueryProvider client={client} profileId={profileA}><Seed profileId={profileA}/></HumanChatQueryProvider>)
  await waitFor(() => expect(client.getQueryData(['human-chat', profileA, 'inbox'])).toEqual({profileId: profileA}))

  view.rerender(<HumanChatQueryProvider client={client} profileId={profileB}><Seed profileId={profileB}/></HumanChatQueryProvider>)

  await waitFor(() => expect(client.getQueryData(['human-chat', profileA, 'inbox'])).toBeUndefined())
  expect(client.getQueryData(['human-chat', profileB, 'inbox'])).toEqual({profileId: profileB})
})
