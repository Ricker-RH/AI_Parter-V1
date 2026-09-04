'use client'

import {ChatStreamEventSchema, type ChatMessage} from '@aifans/contracts'
import {useEffect, useRef, useState, type FormEvent, type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import {authHref} from '../../lib/auth/return-to'
import styles from './MessagesWorkspace.module.css'

export type ChatComposerLabels = {messagePlaceholder: string; send: string; sending: string; messageFailed: string; retry: string; providerUnavailable: string; invalidResponse: string; unavailable: string}
type Failure = {body: string; requestId: string; messageId: string} | null

function withMessage(messages: ChatMessage[], previousId: string, next: ChatMessage) {
  const index = messages.findIndex((message) => message.id === previousId)
  return index === -1 ? [...messages, next] : messages.map((message) => message.id === previousId ? next : message)
}
function upsertMessage(messages: ChatMessage[], next: ChatMessage) { return messages.some((message) => message.id === next.id) ? withMessage(messages, next.id, next) : [...messages, next] }
function sentMessage(messages: ChatMessage[], id: string) { return messages.map((message) => message.id === id ? {...message, deliveryState: 'sent' as const} : message) }
function withoutMessage(messages: ChatMessage[], id: string | null) { return id ? messages.filter((message) => message.id !== id) : messages }
function isEventStream(response: Response) { return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'text/event-stream' }

function streamFrames(text: string) {
  const frames: string[] = []
  let rest = text
  for (;;) {
    const separator = /\r?\n\r?\n/.exec(rest)
    if (!separator) return {frames, rest}
    const raw = rest.slice(0, separator.index)
    rest = rest.slice(separator.index + separator[0].length)
    if (raw.startsWith('data: ')) frames.push(raw.slice(6))
    else if (raw && !raw.startsWith(':')) throw Error('invalid')
  }
}

export function ChatComposer({conversationId, labels, locale, messages = [], onMessages, sendEnabled = true}: {conversationId: string; labels: ChatComposerLabels; locale: Locale; messages?: ChatMessage[]; onMessages: (messages: ChatMessage[]) => void; sendEnabled?: boolean}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure>(null)
  const active = useRef(false)
  const operation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const cleanedReaders = useRef(new WeakSet<ReadableStreamDefaultReader<Uint8Array>>())
  const mounted = useRef(true)
  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])
  async function cleanupReader(reader: ReadableStreamDefaultReader<Uint8Array> | null) {
    if (!reader || cleanedReaders.current.has(reader)) return
    cleanedReaders.current.add(reader)
    try { await reader.cancel() } catch {}
    try { reader.releaseLock() } catch {}
    if (readerRef.current === reader) readerRef.current = null
  }
  async function cancelBody(response: Response) { try { await response.body?.cancel() } catch {} }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current += 1; active.current = false; controller.current?.abort(); void cleanupReader(readerRef.current) } }, [])

  async function send(body: string, requestId = crypto.randomUUID(), retryId?: string) {
    const trimmed = body.trim()
    if (!trimmed || active.current || !sendEnabled) return
    const id = operation.current + 1
    operation.current = id
    const request = new AbortController()
    controller.current = request
    const current = () => mounted.current && operation.current === id && !request.signal.aborted
    const publish = (next: ChatMessage[]) => { if (!current()) return false; messagesRef.current = next; onMessages(next); return true }
    active.current = true
    setSending(true); setError(null); setFailure(null)
    const optimistic: ChatMessage = {id: retryId ?? requestId, role: 'human', body: trimmed, deliveryState: 'pending', createdAt: new Date().toISOString()}
    const start = retryId ? withMessage(messagesRef.current, retryId, optimistic) : [...messagesRef.current, optimistic]
    publish(start); setDraft('')
    let persistedId = optimistic.id
    let assistantId: string | null = null
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: trimmed, requestId, locale}), signal: request.signal})
      if (!current()) { await cancelBody(response); return }
      if (response.status === 401) { await cancelBody(response); if (current()) globalThis.location.assign(authHref(locale, `/${locale}/messages/${conversationId}`)); return }
      if (!response.ok) { await cancelBody(response); if (!current()) return; throw Error(response.status === 502 ? 'provider' : 'unavailable') }
      if (!response.body || !isEventStream(response)) { await cancelBody(response); if (!current()) return; throw Error('invalid') }
      reader = response.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = '', terminal = false, phase: 'start' | 'deltas' = 'start'
      for (;;) {
        const next = await reader.read()
        if (!current()) { await cleanupReader(reader); return }
        buffer += decoder.decode(next.value, {stream: !next.done})
        const parsed = streamFrames(buffer); buffer = parsed.rest
        for (const frame of parsed.frames) {
          const event = ChatStreamEventSchema.safeParse(JSON.parse(frame))
          if (!event.success) throw Error('invalid')
          if (event.data.type === 'human_message') {
            if (phase !== 'start') throw Error('invalid')
            phase = 'deltas'; persistedId = event.data.message.id
            const updated = withMessage(messagesRef.current, optimistic.id, event.data.message)
            publish(updated)
          } else if (event.data.type === 'assistant_delta') {
            if (phase !== 'deltas' || terminal) throw Error('invalid')
            const temporary: ChatMessage = {id: assistantId ?? `${requestId}-assistant`, role: 'assistant', body: '', deliveryState: 'pending', createdAt: new Date().toISOString()}
            assistantId = temporary.id
            const existing = messagesRef.current.find((message) => message.id === temporary.id)
            const updated = existing ? withMessage(messagesRef.current, temporary.id, {...existing, body: existing.body + event.data.delta}) : [...messagesRef.current, {...temporary, body: event.data.delta}]
            publish(updated)
          } else if (event.data.type === 'assistant_complete') {
            if (phase !== 'deltas' || terminal) throw Error('invalid')
            terminal = true
            const withHuman = sentMessage(messagesRef.current, persistedId)
            const updated = assistantId ? withMessage(withHuman, assistantId, event.data.message) : upsertMessage(withHuman, event.data.message)
            publish(updated)
            await cleanupReader(reader)
            return
          } else {
            if (phase !== 'deltas' || terminal) throw Error('invalid')
            terminal = true
            const failed = withoutMessage(messagesRef.current, assistantId).map((message) => message.id === persistedId ? {...message, deliveryState: 'failed' as const} : message)
            if (publish(failed)) { setFailure({body: trimmed, requestId, messageId: persistedId}); setError(labels.messageFailed) }
          }
        }
        if (next.done) break
      }
      await cleanupReader(reader)
      if (!current()) return
      if (buffer.trim() || !terminal) throw Error('invalid')
    } catch (cause) {
      await cleanupReader(reader)
      if ((cause as Error).name === 'AbortError' || !current()) return
      const failed = withoutMessage(messagesRef.current, assistantId).map((message) => message.id === persistedId ? {...message, deliveryState: 'failed' as const} : message)
      if (publish(failed)) { setFailure({body: trimmed, requestId, messageId: persistedId}); setError((cause as Error).message === 'provider' ? labels.providerUnavailable : (cause as Error).message === 'invalid' ? labels.invalidResponse : labels.unavailable); active.current = false; setSending(false) }
      request.abort()
      if (controller.current === request) controller.current = null
    } finally {
      await cleanupReader(reader)
      if (current()) { active.current = false; setSending(false); if (controller.current === request) controller.current = null }
    }
  }
  return <ChatComposerForm draft={draft} setDraft={setDraft} sending={sending} labels={labels} sendEnabled={sendEnabled} error={error} onSend={() => void send(draft)} onRetry={failure ? () => void send(failure.body, failure.requestId, failure.messageId) : undefined}/>
}

/** Shared text composer presentation; AI streaming and human delivery keep separate protocols. */
export function ChatComposerForm({draft, setDraft, sending, labels, sendEnabled = true, error, notice, onSend, onRetry}: {draft: string; setDraft: (value: string) => void; sending: boolean; labels: ChatComposerLabels; sendEnabled?: boolean; error?: string | null; notice?: string | undefined; onSend: () => void; onRetry?: (() => void) | undefined}) {
  function submit(event: FormEvent<HTMLFormElement>) {event.preventDefault(); onSend()}
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); event.currentTarget.form?.requestSubmit()}}
  return <form className={styles.composer} onSubmit={submit}>
    <textarea aria-label={labels.messagePlaceholder} disabled={!sendEnabled || sending} maxLength={4000} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} placeholder={labels.messagePlaceholder} rows={2} value={draft}/>
    <button disabled={!sendEnabled || sending || !draft.trim()} type="submit">{sending ? labels.sending : labels.send}</button>
    {!sendEnabled || notice ? <p className={styles.composerNotice}>{notice ?? labels.providerUnavailable}</p> : null}
    {error ? <p className={styles.composerError} role="alert">{error}</p> : null}
    {onRetry ? <button className={styles.retry} disabled={sending || !sendEnabled} onClick={onRetry} type="button">{labels.retry}</button> : null}
  </form>
}
