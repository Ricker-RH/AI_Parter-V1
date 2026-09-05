'use client'

import {outsideDismiss} from '../../lib/ui/outside-dismiss'

import type {PublicIp} from '@aifans/contracts'
import {HumanMessageSchema, HumanShareRecipientPageSchema} from '@aifans/contracts'
import {createPortal} from 'react-dom'
import {useEffect, useMemo, useRef, useState} from 'react'
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
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = Array.from({length: 16}, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function downloadShareGraphic(profile: Pick<PublicIp, 'id' | 'displayName' | 'username' | 'bio'>, url: string) {
  const canvas = document.createElement('canvas')
  canvas.height = 1200; canvas.width = 900
  const context = canvas.getContext('2d')
  if (!context) throw Error('canvas unavailable')
  context.fillStyle = '#101114'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#f5f5f6'; context.font = '700 78px system-ui'; context.fillText('AIFANS', 72, 126)
  context.fillStyle = '#1d65ff'; context.beginPath(); context.arc(450, 390, 160, 0, Math.PI * 2); context.fill()
  context.fillStyle = '#ffffff'; context.font = '700 74px system-ui'; context.textAlign = 'center'; context.fillText(profile.displayName.slice(0, 1), 450, 418)
  context.textAlign = 'left'; context.fillStyle = '#f5f5f6'; context.font = '700 58px system-ui'; context.fillText(profile.displayName, 72, 670)
  context.fillStyle = '#a9abb2'; context.font = '36px system-ui'; context.fillText(`@${profile.username}`, 72, 730)
  const description = profile.bio ?? profile.displayName
  context.fillStyle = '#f5f5f6'; context.font = '40px system-ui'; context.fillText(description.slice(0, 34), 72, 824)
  context.fillStyle = '#a9abb2'; context.font = '28px system-ui'; context.fillText(url, 72, 1102)
  const link = document.createElement('a')
  link.download = `${profile.username || profile.id}-aifans.png`; link.href = canvas.toDataURL('image/png'); link.click()
}

export function IpProfileShareAction({locale, profile}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const menuRoot = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!menuOpen) return; return outsideDismiss(target => Boolean(menuRoot.current?.contains(target)), () => setMenuOpen(false)) }, [menuOpen])
  return <div className={styles.menu} ref={menuRoot}>
    <button aria-expanded={menuOpen} aria-haspopup="menu" aria-label={locale === 'zh-CN' ? '更多' : 'More'} className={styles.menuTrigger} onClick={() => setMenuOpen(value => !value)} type="button">•••</button>
    {menuOpen ? <div className={styles.menuPopover} role="menu"><button onClick={() => { setMenuOpen(false); setSheetOpen(true) }} role="menuitem" type="button">{locale === 'zh-CN' ? '分享' : 'Share'}</button></div> : null}
    {sheetOpen ? <IpProfileShareSheet locale={locale} onClose={() => setSheetOpen(false)} profile={profile}/> : null}
  </div>
}

export function IpProfileShareSheet({locale, onClose, profile, targetKind = 'ip', onShared}: {locale: Locale; onClose: () => void; profile: Pick<PublicIp, 'id' | 'displayName' | 'username' | 'bio'>; targetKind?: 'ip' | 'post'; onShared?: () => Promise<void>}) {
  const current = useOptionalCurrentAccount()
  const account = current?.account
  const [recipients, setRecipients] = useState<Recipient[] | null>(null)
  const [selected, setSelected] = useState<Recipient | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'copied' | 'error' | 'relationship-error' | 'graphic' | 'sent'>('idle')
  const [dragStart, setDragStart] = useState<number | null>(null)
  const url = useMemo(() => targetKind === 'post' ? `${globalThis.location?.origin ?? ''}/${locale}/posts/${profile.id}` : shareUrl(locale, profile.id), [locale, profile.id, targetKind])
  const text = locale === 'zh-CN' ? {
    title: '分享给', close: '关闭', copy: '复制链接', system: '系统分享', graphic: '生成分享图', friend: '发送给好友', empty: '暂无可分享的互关好友。互相关注后即可发送', note: '捎一句话', send: '发送', sent: '已发送', copied: '链接已复制', graphicReady: '分享图已生成', error: '操作未完成，请重试。', relationshipError: '当前无法发送给该好友，请确认仍互相关注后重试。', unavailable: '暂时无法加载好友。', card: 'IP 名片', share: '分享',
  } : {
    title: 'Share to', close: 'Close', copy: 'Copy link', system: 'System share', graphic: 'Create share image', friend: 'Send to a friend', empty: 'No mutual friends to share with yet.', note: 'Add a message', send: 'Send', sent: 'Sent', copied: 'Link copied.', graphicReady: 'Share image created.', error: 'Could not complete that action. Try again.', relationshipError: 'This friend can no longer receive this share. Confirm you still follow each other and try again.', unavailable: 'Friends are unavailable right now.', card: 'IP card', share: 'Share',
  }

  const active = useRef(true)
  useEffect(() => {
    active.current = true
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    return () => { active.current = false; document.removeEventListener('keydown', escape) }
  }, [])
  async function completedShare() { if (active.current) await onShared?.() }
  const firstRecipient = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (account?.kind !== 'human') { setRecipients([]); return }
    const controller = new AbortController()
    void fetch('/api/human-chat/share-recipients', {cache: 'no-store', credentials: 'same-origin', method: 'GET', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw Error('FRIENDS_UNAVAILABLE')
        const page = HumanShareRecipientPageSchema.parse(await response.json())
        if (!controller.signal.aborted) setRecipients(page.items)
      })
      .catch(() => { if (!controller.signal.aborted) setRecipients(null) })
    return () => controller.abort()
  }, [account?.id, account?.kind])

  async function copyLink() {
    try { await copy(url); setStatus('copied'); await completedShare() } catch { setStatus('error') }
  }
  async function systemShare() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') await navigator.share(targetKind === 'post' ? {url} : {title: profile.displayName, text: profile.bio ?? profile.displayName, url})
      else await copy(url)
      setStatus('copied')
      await completedShare()
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus('error') }
  }
  function createGraphic() {
    try { downloadShareGraphic(profile, url); setStatus('graphic'); void completedShare() } catch { setStatus('error') }
  }
  async function send() {
    if (!selected || sending) return
    setSending(true); setStatus('idle')
    try {
      const messages = note.trim() ? [{kind: 'text' as const, text: note.trim()}, {kind: 'share' as const, target: {kind: targetKind, id: profile.id}}] : [{kind: 'share' as const, target: {kind: targetKind, id: profile.id}}]
      for (const content of messages) {
        const response = await fetch(`/api/human-chat/peers/${selected.id}/messages`, {method: 'POST', headers: {'content-type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({clientRequestId: uuid(), content})})
        if (!response.ok) {
          const code = await response.json().then(value => typeof value === 'object' && value !== null && 'code' in value ? value.code : null).catch(() => null)
          throw Error(code === 'HUMAN_CHAT_MUTUAL_FOLLOW_REQUIRED' || code === 'HUMAN_CHAT_BLOCKED' ? 'RELATIONSHIP_CHANGED' : 'SEND_UNAVAILABLE')
        }
        HumanMessageSchema.parse((await response.json()).message)
      }
      setStatus('sent'); setNote(''); await completedShare()
    } catch (error) { setStatus((error as Error).message === 'RELATIONSHIP_CHANGED' ? 'relationship-error' : 'error') } finally { setSending(false) }
  }

  return createPortal(<div className={styles.backdrop} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}>
    <section aria-label={`${text.share} ${profile.displayName}`} aria-modal="true" className={styles.sheet} role="dialog">
      <div className={styles.handle} onPointerDown={event => setDragStart(event.clientY)} onPointerUp={event => { if (dragStart !== null && event.clientY - dragStart > 80) onClose(); setDragStart(null) }}/><header><h2>{text.title}</h2><button aria-label={text.close} onClick={onClose} type="button">×</button></header>
      <div className={styles.recipients} aria-label={text.friend}>{recipients === null ? <p role="status">…</p> : recipients.length === 0 ? <p>{text.empty}</p> : recipients.map((person, index) => <button aria-pressed={selected?.id === person.id} className={styles.recipient} key={person.id} onClick={() => setSelected(person)} ref={index === 0 ? firstRecipient : undefined} type="button"><HumanAvatar decorative human={person} size="medium"/><span>{person.displayName}</span></button>)}</div>
      {selected ? <div className={styles.sendPanel}><label><span>{text.note}</span><textarea maxLength={4000} onChange={event => setNote(event.target.value)} placeholder={text.note} value={note}/></label><div className={styles.card}><span>{targetKind === 'post' ? (locale === 'zh-CN' ? '内容卡片' : 'Post card') : text.card}</span><strong>{profile.displayName}</strong>{targetKind === 'post' && profile.bio ? <p>{profile.bio.slice(0, 240)}</p> : null}<small>{targetKind === 'post' ? url : `@${profile.username}`}</small></div><button className={styles.send} disabled={sending} onClick={() => void send()} type="button">{sending ? '…' : text.send}</button></div> : null}
      <div className={styles.actions}><button disabled={!recipients?.length} onClick={() => firstRecipient.current?.focus()} type="button">{text.friend}</button><button onClick={() => void copyLink()} type="button">{text.copy}</button><button onClick={() => void systemShare()} type="button">{text.system}</button><button onClick={createGraphic} type="button">{text.graphic}</button></div>
      {status === 'copied' ? <p aria-live="polite" className={styles.status}>{text.copied}</p> : status === 'graphic' ? <p aria-live="polite" className={styles.status}>{text.graphicReady}</p> : status === 'sent' ? <p aria-live="polite" className={styles.status}>{text.sent}</p> : status === 'relationship-error' ? <p className={styles.error} role="alert">{text.relationshipError}</p> : status === 'error' ? <p className={styles.error} role="alert">{text.error}</p> : null}
    </section>
  </div>, document.body)
}
