'use client'

import {ChatMessageInputSchema, ChatMessageResponseSchema} from '@aifans/contracts'
import {useRef, useState, type FormEvent, type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'

export interface ChatLabels {
  title: string
  eyebrow: string
  description: string
  targetLabel: string
  targetHint: string
  targetRequired: string
  conversationLabel: string
  sessionNotice: string
  emptyTitle: string
  emptyDescription: string
  messageLabel: string
  messagePlaceholder: string
  send: string
  sending: string
  waiting: string
  you: string
  ai: string
  newConversation: string
  authRequired: string
  chatNotConfigured: string
  providerUnavailable: string
  requestFailed: string
  invalidResponse: string
}

type ChatMessage = {id: string; role: 'user' | 'assistant'; text: string}
type ChatState = {kind: 'idle' | 'pending'} | {kind: 'error'; message: string}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class ChatRequestError extends Error {
  constructor(readonly kind: 'auth' | 'not-configured' | 'provider' | 'request' | 'invalid-response') {
    super(kind)
  }
}

function localizedError(error: unknown, labels: ChatLabels) {
  if (!(error instanceof ChatRequestError)) return labels.chatNotConfigured
  if (error.kind === 'auth') return labels.authRequired
  if (error.kind === 'provider') return labels.providerUnavailable
  if (error.kind === 'not-configured') return labels.chatNotConfigured
  if (error.kind === 'invalid-response') return labels.invalidResponse
  return labels.requestFailed
}

async function sendChat(ipProfileId: string, body: object) {
  let response: Response
  try {
    response = await fetch(`/api/chat/${encodeURIComponent(ipProfileId)}/messages`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    })
  } catch {
    throw new ChatRequestError('not-configured')
  }
  if (!response.ok) {
    if (response.status === 401) throw new ChatRequestError('auth')
    if (response.status === 502) throw new ChatRequestError('provider')
    if (response.status === 503) throw new ChatRequestError('not-configured')
    throw new ChatRequestError('request')
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new ChatRequestError('invalid-response')
  }
  const parsed = ChatMessageResponseSchema.safeParse(json)
  if (!parsed.success) throw new ChatRequestError('invalid-response')
  return parsed.data
}

export function ChatPanel({locale, labels}: {locale: Locale; labels: ChatLabels}) {
  const [ipProfileId, setIpProfileId] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [state, setState] = useState<ChatState>({kind: 'idle'})
  const localId = useRef(0)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.kind === 'pending') return
    const target = ipProfileId.trim()
    if (!uuid.test(target)) {
      setState({kind: 'error', message: labels.targetRequired})
      return
    }
    const payload = ChatMessageInputSchema.safeParse({message: draft, ...(conversationId ? {conversationId} : {}), locale})
    if (!payload.success) {
      setState({kind: 'error', message: labels.requestFailed})
      return
    }

    localId.current += 1
    const userMessage: ChatMessage = {id: `local-${localId.current}`, role: 'user', text: payload.data.message}
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setState({kind: 'pending'})
    try {
      const response = await sendChat(target, payload.data)
      setConversationId(response.conversationId)
      setMessages((current) => [...current, {id: response.messageId, role: 'assistant', text: response.answer}])
      setState({kind: 'idle'})
    } catch (error) {
      setDraft((current) => current || payload.data.message)
      setState({kind: 'error', message: localizedError(error, labels)})
    }
  }

  function resetConversation() {
    setConversationId(null)
    setMessages([])
    setDraft('')
    setState({kind: 'idle'})
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (state.kind !== 'pending') event.currentTarget.form?.requestSubmit()
  }

  return <main className="chat-page">
    <header className="chat-header"><p className="chat-eyebrow">{labels.eyebrow}</p><h1>{labels.title}</h1><p>{labels.description}</p></header>
    <section className="chat-context">
      <div className="chat-target-row"><label htmlFor="chat-ip-id">{labels.targetLabel}</label>{conversationId ? <button onClick={resetConversation} type="button">{labels.newConversation}</button> : null}</div>
      <input aria-describedby="chat-target-hint" aria-invalid={state.kind === 'error' && state.message === labels.targetRequired ? true : undefined} disabled={conversationId !== null || state.kind === 'pending'} id="chat-ip-id" onChange={(event) => setIpProfileId(event.target.value)} placeholder="00000000-0000-4000-8000-000000000000" value={ipProfileId} />
      <p id="chat-target-hint">{labels.targetHint}</p>
      {conversationId ? <p className="chat-conversation"><span>{labels.conversationLabel}</span><code>{conversationId}</code></p> : null}
      <p className="chat-session-notice">{labels.sessionNotice}</p>
    </section>

    <section className="chat-transcript" aria-label={labels.title}>
      {messages.length === 0 ? <div className="chat-empty"><h2>{labels.emptyTitle}</h2><p>{labels.emptyDescription}</p></div> : <ol aria-live="polite">{messages.map((message, index) => <li className={`chat-message chat-message-${message.role}`} key={`${message.role}-${message.id}-${index}`}><span>{message.role === 'user' ? labels.you : labels.ai}</span><p>{message.text}</p></li>)}</ol>}
      {state.kind === 'pending' ? <p className="chat-request-status" role="status">{labels.waiting}</p> : null}
      {state.kind === 'error' ? <p className="chat-request-status chat-request-error" role="alert">{state.message}</p> : null}
    </section>

    <form className="chat-composer" noValidate onSubmit={submit}>
      <label htmlFor="chat-message">{labels.messageLabel}</label>
      <textarea id="chat-message" maxLength={4000} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={labels.messagePlaceholder} rows={3} value={draft} />
      <button disabled={state.kind === 'pending'} type="submit">{state.kind === 'pending' ? labels.sending : labels.send}</button>
    </form>
  </main>
}
