'use client'

import type {PublicIp} from '@aifans/contracts'
import {HumanInboxPageSchema, HumanMessageSchema, HumanConversationSchema, type HumanInboxPage} from '@aifans/contracts'
import {useEffect, useMemo, useState} from 'react'
import type {Locale} from '../../i18n/config'
import {HumanAvatar} from '../account/HumanAvatar'
import {useOptionalCurrentAccount} from '../account/CurrentAccountProvider'
import styles from './IpProfileShareAction.module.css'

type Props = {locale: Locale; profile: PublicIp}
type Recipient = {id: string; displayName: string; avatarUrl?: string | null}

function copy(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return Promise.reject(new Error('clipboard unavailable'))
  return navigator.clipboard.writeText(value)
}

function shareUrl(locale: Locale, profileId: string) {
  return `${globalThis.location?.origin ?? ''}/${locale}/profiles/${profileId}`
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`
}

export function IpProfileShareAction({locale, profile}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  return <div className={styles.menu}>
    <button aria-expanded={menuOpen} aria-haspopup="menu" aria-label={locale === 'zh-CN' ? '更多' : 'More'} className={styles.menuTrigger} onClick={() => setMenuOpen(value => !value)} type="button">•••</button>
    {menuOpen ? <div className={styles.menuPopover} role="menu"><button onClick={() => { setMenuOpen(false); setSheetOpen(true) }} role="menuitem" type="button">{locale === 'zh-CN' ? '分享' : 'Share'}</button></div> : null}
    {sheetOpen ? <IpProfileShareSheet locale={locale} onClose={() => setSheetOpen(false)} profile={profile}/> : null}
  </div>
}

function IpProfileShareSheet({locale, onClose, profile}: Props & {onClose: () => void}) {
  const current = useOptionalCurrentAccount()
  const account = current?.account
  const [recipients, setRecipients] = useState<Recipient[] | null>(null)
  const [selected, setSelected] = useState<Recipient | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'copied' | 'error' | 'sent'>('idle')
  const url = useMemo(() => shareUrl(locale, profile.id), [locale, profile.id])
  const text = locale === 'zh-CN' ? {
    title: '分享给', close: '关闭', copy: '复制链接', system: '系统分享', friend: '发送给好友', empty: '暂无可分享的互关好友。', note: '捎一句话', send: '发送', sent: '已发送', copied: '链接已复制', error: '操作未完成，请重试。', unavailable: '暂时无法加载好友。', card: 'IP 名片', share: '分享',
  } : {
    title: 'Share to', close: 'Close', copy: 'Copy link', system: 'System share', friend: 'Send to a friend', empty: 'No mutual friends to share with yet.', note: 'Add a message', send: 'Send', sent: 'Sent', copied: 'Link copied.', error: 'Could not complete that action. Try again.', unavailable: 'Friends are unavailable right now.', card: 'IP card', share: 'Share',
  }

  useEffect(() => {
    if (account?.kind !== 'human') { setRecipients([]); return }
    const controller = new AbortController()
    void fetch('/api/human-chat/conversations?limit=20', {cache: 'no-store', credentials: 'same-origin', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw Error()
        const page = HumanInboxPageSchema.parse(await response.json())
        const peers = page.items.map(item => item.conversation.participants.find(person => person.id !== account.id)!).filter((person, index, list) => list.findIndex(candidate => candidate.id === person.id) === index)
        if (!controller.signal.aborted) setRecipients(peers)
      })
      .catch(() => { if (!controller.signal.aborted) setRecipients(null) })
    return () => controller.abort()
  }, [account?.id, account?.kind])

  async function copyLink() {
    try { await copy(url); setStatus('copied') } catch { setStatus('error') }
  }
  async function systemShare() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') await navigator.share({title: profile.displayName, text: profile.bio ?? profile.displayName, url})
      else await copy(url)
      setStatus('copied')
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus('error') }
  }
  async function send() {
    if (!selected || sending) return
    setSending(true); setStatus('idle')
    try {
      const created = await fetch('/api/human-chat/conversations', {method: 'POST', headers: {'content-type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({peerProfileId: selected.id})})
      if (!created.ok) throw Error()
      const conversation = HumanConversationSchema.parse((await created.json()).conversation)
      const messages = note.trim() ? [{kind: 'text' as const, text: note.trim()}, {kind: 'share' as const, target: {kind: 'ip' as const, id: profile.id}}] : [{kind: 'share' as const, target: {kind: 'ip' as const, id: profile.id}}]
      for (const content of messages) {
        const response = await fetch(`/api/human-chat/conversations/${conversation.id}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({clientRequestId: uuid(), content})})
        if (!response.ok) throw Error()
        HumanMessageSchema.parse(await response.json())
      }
      setStatus('sent'); setNote('')
    } catch { setStatus('error') } finally { setSending(false) }
  }

  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-label={`${text.share} ${profile.displayName}`} aria-modal="true" className={styles.sheet} role="dialog">
      <div className={styles.handle}/><header><h2>{text.title}</h2><button aria-label={text.close} onClick={onClose} type="button">×</button></header>
      <div className={styles.recipients} aria-label={text.friend}>{recipients === null ? <p role="status">…</p> : recipients.length === 0 ? <p>{text.empty}</p> : recipients.map(person => <button aria-pressed={selected?.id === person.id} className={styles.recipient} key={person.id} onClick={() => setSelected(person)} type="button"><HumanAvatar decorative human={person} size="medium"/><span>{person.displayName}</span></button>)}</div>
      {selected ? <div className={styles.sendPanel}><label><span>{text.note}</span><textarea maxLength={4000} onChange={event => setNote(event.target.value)} placeholder={text.note} value={note}/></label><div className={styles.card}><span>{text.card}</span><strong>{profile.displayName}</strong><small>@{profile.username}</small></div><button className={styles.send} disabled={sending} onClick={() => void send()} type="button">{sending ? '…' : text.send}</button></div> : null}
      <div className={styles.actions}><button onClick={() => void copyLink()} type="button">{text.copy}</button><button onClick={() => void systemShare()} type="button">{text.system}</button></div>
      {status === 'copied' ? <p aria-live="polite" className={styles.status}>{text.copied}</p> : status === 'sent' ? <p aria-live="polite" className={styles.status}>{text.sent}</p> : status === 'error' ? <p className={styles.error} role="alert">{text.error}</p> : null}
    </section>
  </div>
}
