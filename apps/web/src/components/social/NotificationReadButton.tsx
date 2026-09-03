'use client'

import {useEffect, useRef, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'

let operationSequence = 0

function nextOperationId(notificationId: string) {
  operationSequence += 1
  return `${notificationId}:${operationSequence}`
}

function validReadResponse(value: unknown): value is {readAt: string} {
  if (typeof value !== 'object' || value === null) return false
  const entries = Object.entries(value)
  const readAt = entries.length === 1 && entries[0]?.[0] === 'readAt' && typeof entries[0][1] === 'string' ? entries[0][1] : null
  return readAt !== null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(readAt) && !Number.isNaN(Date.parse(readAt))
}

type ReadCallbacks = {
  onOptimisticRead?(operationId: string): void
  onRead?(readAt: string, operationId: string): void
  onReadError?(operationId: string): void
}

type NotificationReadButtonProps = ReadCallbacks & {
  auto?: boolean
  errorLabel: string
  label: string
  locale: Locale
  notificationId: string
  pendingLabel: string
  readClassName?: string | undefined
  readLabel?: string
  retryLabel?: string
  viewerScope: string
}

export function NotificationReadButton({notificationId, viewerScope, ...props}: NotificationReadButtonProps) {
  const scope = JSON.stringify([notificationId, viewerScope])
  return <ScopedNotificationReadButton key={scope} notificationId={notificationId} viewerScope={viewerScope} {...props}/>
}

function ScopedNotificationReadButton({notificationId, label, pendingLabel, readClassName, readLabel, retryLabel, errorLabel, locale, auto = false, onOptimisticRead, onRead, onReadError}: NotificationReadButtonProps) {
  const [pending, setPending] = useState(false)
  const [read, setRead] = useState(false)
  const [error, setError] = useState(false)
  const mutationId = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const started = useRef(false)
  const activeOperation = useRef<{id: string; settled: boolean} | null>(null)

  useEffect(() => () => {
    const operation = activeOperation.current
    if (operation && !operation.settled) {
      operation.settled = true
      onReadError?.(operation.id)
    }
    mutationId.current += 1
    controller.current?.abort()
    started.current = false
  }, [])

  useEffect(() => {
    if (auto && !started.current) {
      started.current = true
      void markRead()
    }
  }, [auto])

  async function markRead() {
    if (pending || read) return
    const requestId = ++mutationId.current
    const requestController = new AbortController()
    const operation = {id: nextOperationId(notificationId), settled: false}
    controller.current = requestController
    activeOperation.current = operation
    const isCurrent = () => !requestController.signal.aborted && requestId === mutationId.current
    const rollback = () => {
      if (operation.settled) return
      operation.settled = true
      onReadError?.(operation.id)
    }

    setRead(true)
    setPending(true)
    setError(false)
    onOptimisticRead?.(operation.id)
    try {
      const response = await fetch(`/api/social/notifications/${notificationId}/read`, {method: 'PUT', credentials: 'include', signal: requestController.signal})
      if (!isCurrent()) return
      if (response.status === 401) {
        setRead(false)
        rollback()
        globalThis.location.assign(authHref(locale, `${globalThis.location.pathname}${globalThis.location.search}`))
        return
      }
      const body: unknown = await response.json()
      if (!response.ok || !validReadResponse(body)) throw new Error('read failed')
      operation.settled = true
      onRead?.(body.readAt, operation.id)
    } catch {
      if (isCurrent()) {
        setRead(false)
        setError(true)
        rollback()
      }
    } finally {
      if (isCurrent()) {
        controller.current = null
        activeOperation.current = null
        setPending(false)
      }
    }
  }

  const showAction = !read && (!auto || error)
  return <>
    {showAction ? <button aria-busy={pending} className="notification-read" disabled={pending} onClick={() => void markRead()} type="button">{pending ? pendingLabel : error ? retryLabel ?? label : label}</button> : null}
    {auto && read && !pending && readLabel ? <span className={readClassName}>{readLabel}</span> : null}
    <span aria-live="polite" className="interaction-error">{pending ? pendingLabel : error ? errorLabel : ''}</span>
  </>
}
