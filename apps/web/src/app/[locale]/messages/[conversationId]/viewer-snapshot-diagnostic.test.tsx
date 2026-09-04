import {render, screen, waitFor, cleanup, fireEvent} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {CurrentAccountProvider} from '../../../../components/account/CurrentAccountProvider'
import ConversationPage from './page'

const mocks = vi.hoisted(() => ({serverFetch: vi.fn(), refresh: vi.fn()}))
vi.mock('../../../../lib/server-api', () => ({fetchAifansApi: mocks.serverFetch}))
vi.mock('../../../../lib/auth/access-policy', () => ({requireAuthenticatedPage: async () => ({status:'authenticated',token:'test-only-token'}), redirectToUserSignIn: vi.fn()}))
vi.mock('next/navigation', () => ({notFound: vi.fn(), useRouter: () => ({refresh:mocks.refresh})}))

const id='33333333-3333-4333-8333-333333333333'
const account={id:'11111111-1111-4111-8111-111111111111',kind:'human',username:'viewer',displayName:'Viewer',avatarUrl:null,preferredLocale:'en',creatorModeEnabled:false,profileVersion:1,background:{type:'color',colorKey:'paper'}}
const conversation={id,ipProfile:{id:'22222222-2222-4222-8222-222222222222',displayName:'Test AI',username:'test_ai'},lastMessage:null,updatedAt:'2026-09-01T00:00:00Z',sendEnabled:true}
const history={conversation,items:[{id:'44444444-4444-4444-8444-444444444444',role:'assistant',body:'Saved test answer',deliveryState:'sent',createdAt:'2026-09-01T00:00:00Z'}],nextCursor:null}
afterEach(() => {cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks()})

// These controlled failures characterize the observed gate, not the cause of a live incident.
it.each(['transport timeout', 'invalid 200 projection'] as const)('reproduces missing SSR identity after %s despite successful history and later client identity', async (failure) => {
  vi.useFakeTimers()
  let upstreamMeStatus=0
  let slowViewer=true
  let retryFails=false
  let viewerStarted!: () => void
  const started = new Promise<void>((resolve) => { viewerStarted = resolve })
  mocks.serverFetch.mockImplementation(async (path:string, options:{requestInit?:RequestInit}) => {
    if(path==='/v1/me') {
      upstreamMeStatus=200 // Simulated upstream success; transport and projection can still fail.
      viewerStarted()
      if(retryFails || (slowViewer && failure==='invalid 200 projection')) return Response.json({...account, unexpectedField:true})
      if(slowViewer) return new Promise<Response>((_resolve,reject)=>options.requestInit?.signal?.addEventListener('abort',()=>reject(Error('transport aborted')), {once:true}))
      return Response.json(account)
    }
    return Response.json(path.endsWith('/messages') ? history : {items:[conversation],nextCursor:null})
  })
  const request={params:Promise.resolve({locale:'en',conversationId:id}),searchParams:Promise.resolve({})}
  const pending=ConversationPage(request)
  await started
  await vi.advanceTimersByTimeAsync(1501)
  const page=await pending
  expect(upstreamMeStatus).toBe(200)
  expect(page?.props.history.items[0].body).toBe('Saved test answer')
  expect(page?.props.snapshotViewerId).toBeUndefined()
  expect(page?.props.snapshotViewerStatus).toBe('unavailable')
  vi.useRealTimers()
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/me'?account:{items:[],nextCursor:null})))
  const view=render(<CurrentAccountProvider>{page}</CurrentAccountProvider>)
  await waitFor(()=>expect(screen.getByRole('button', {name:'Try again'})).toBeEnabled())
  expect(mocks.refresh).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Messages are unavailable right now.')
  expect(screen.queryByText('Saved test answer')).toBeNull()
  fireEvent.click(screen.getByRole('button', {name:'Try again'}))
  await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledOnce())
  expect(screen.queryByText('Saved test answer')).toBeNull()
  retryFails=true
  const stillUnavailable=await ConversationPage(request)
  view.rerender(<CurrentAccountProvider>{stillUnavailable}</CurrentAccountProvider>)
  expect(await screen.findByRole('button', {name:'Try again'})).toBeEnabled()
  expect(screen.queryByText('Saved test answer')).toBeNull()
  expect(mocks.refresh).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', {name:'Try again'}))
  await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledTimes(2))
  retryFails=false
  slowViewer=false
  const recovered=await ConversationPage(request)
  expect(recovered?.props.snapshotViewerId).toBe(account.id)
  view.rerender(<CurrentAccountProvider>{recovered}</CurrentAccountProvider>)
  expect(await screen.findByText('Saved test answer')).toBeVisible()
})
