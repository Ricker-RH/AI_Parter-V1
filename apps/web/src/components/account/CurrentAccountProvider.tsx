'use client'

import {AccountSchema, type Account} from '@aifans/contracts'
import {createContext, useCallback, useContext, useMemo, useRef, useState, useEffect, type ReactNode} from 'react'

const ACCOUNT_UPDATED_EVENT = 'aifans:account-updated'
const ACCOUNT_INVALIDATED_EVENT = 'aifans:account-invalidated'

let channel: BroadcastChannel | null = null
let channelUsers = 0
let channelRevision = 0

function parseAccount(value: unknown): Account | null {
  const parsed = AccountSchema.strict().safeParse(value)
  return parsed.success ? parsed.data : null
}

function acquireChannel(): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel !== 'function') return () => undefined
  channelUsers += 1
  channelRevision += 1
  if (!channel) {
    try {
      channel = new BroadcastChannel('aifans-account')
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data
        if (typeof message === 'object' && message !== null && (message as {type?: unknown}).type === 'updated') {
          window.dispatchEvent(new Event(ACCOUNT_INVALIDATED_EVENT))
        }
      }
    } catch {
      channel = null
      channelUsers -= 1
      return () => undefined
    }
  }
  let released = false
  return () => {
    if (released) return
    released = true
    channelUsers -= 1
    const revision = ++channelRevision
    queueMicrotask(() => {
      if (channelUsers === 0 && channelRevision === revision) {
        channel?.close()
        channel = null
      }
    })
  }
}

export function publishAccountUpdate(nextAccount: Account): void {
  if (typeof window === 'undefined') return
  const parsed = parseAccount(nextAccount)
  if (!parsed) return
  window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT, {detail: parsed}))
  channel?.postMessage({type: 'updated'})
}

type CurrentAccountValue = {
  account: Account | null
  loading: boolean
  status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'
  refetch: () => Promise<Account | null>
  update: (account: Account) => void
}

const CurrentAccountContext = createContext<CurrentAccountValue | null>(null)

async function fetchBrowserAccount(signal: AbortSignal): Promise<{kind: 'available'; account: Account | null} | {kind: 'unavailable'}> {
  try {
    const response = await fetch('/api/me', {cache: 'no-store', credentials: 'include', signal})
    if (response.status === 204 || response.status === 401) return {kind: 'available', account: null}
    if (!response.ok) return {kind: 'unavailable'}
    const account = parseAccount(await response.json())
    return account ? {kind: 'available', account} : {kind: 'unavailable'}
  } catch {
    return {kind: 'unavailable'}
  }
}

export function CurrentAccountProvider({children, initialAccount}: {children: ReactNode; initialAccount?: Account}) {
  const initial = useMemo(() => initialAccount === undefined ? undefined : parseAccount(initialAccount) ?? undefined, [initialAccount])
  const [account, setAccount] = useState<Account | null>(initial ?? null)
  const [loading, setLoading] = useState(initial === undefined)
  const [status, setStatus] = useState<CurrentAccountValue['status']>(initial === undefined ? 'loading' : 'authenticated')
  const mounted = useRef(false)
  const started = useRef(false)
  const sequence = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  const refetch = useCallback(async (): Promise<Account | null> => {
    const requestSequence = ++sequence.current
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    if (mounted.current) {
      setLoading(true)
      setStatus('loading')
    }
    const result = await fetchBrowserAccount(controller.signal)
    if (!mounted.current || controller.signal.aborted || sequence.current !== requestSequence) return null
    activeController.current = null
    setLoading(false)
    if (result.kind === 'available') {
      setAccount(result.account)
      setStatus(result.account ? 'authenticated' : 'anonymous')
      return result.account
    }
    setStatus('unavailable')
    return null
  }, [])

  useEffect(() => {
    mounted.current = true
    const releaseChannel = acquireChannel()
    const handleUpdate = (event: Event) => {
      const next = parseAccount((event as CustomEvent<unknown>).detail)
      if (!next) return
      sequence.current += 1
      activeController.current?.abort()
      activeController.current = null
      setAccount(next)
      setLoading(false)
      setStatus('authenticated')
    }
    const handleInvalidation = () => { void refetch() }
    window.addEventListener(ACCOUNT_UPDATED_EVENT, handleUpdate)
    window.addEventListener(ACCOUNT_INVALIDATED_EVENT, handleInvalidation)
    if (initial === undefined && !started.current) {
      started.current = true
      void refetch()
    }
    return () => {
      mounted.current = false
      window.removeEventListener(ACCOUNT_UPDATED_EVENT, handleUpdate)
      window.removeEventListener(ACCOUNT_INVALIDATED_EVENT, handleInvalidation)
      releaseChannel()
      const controller = activeController.current
      queueMicrotask(() => {
        if (!mounted.current) controller?.abort()
      })
    }
  }, [initial, refetch])

  const value = useMemo<CurrentAccountValue>(() => ({
    account,
    loading,
    status,
    refetch,
    update: publishAccountUpdate,
  }), [account, loading, refetch, status])

  return <CurrentAccountContext.Provider value={value}>{children}</CurrentAccountContext.Provider>
}

export function useCurrentAccount(): CurrentAccountValue {
  const value = useContext(CurrentAccountContext)
  if (!value) throw new Error('useCurrentAccount must be used within CurrentAccountProvider')
  return value
}

export function useOptionalCurrentAccount(): CurrentAccountValue | null {
  return useContext(CurrentAccountContext)
}
