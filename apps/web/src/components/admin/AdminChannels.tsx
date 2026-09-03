'use client'

import {AdminChannelPageSchema, ChannelRecordSchema, CreateChannelSchema, UpdateChannelSchema, type ChannelRecord} from '@aifans/contracts'
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react'
import styles from './AdminChannels.module.css'

export type AdminChannelsLabels = {
  title: string; description: string; createTitle: string; slug: string; name: string; channelDescription: string; sortOrder: string; create: string; creating: string
  editTitle: string; save: string; saving: string; publish: string; archive: string; aliases: string; aliasesHint: string; saveAliases: string
  channelList: string; loadingChannels: string; channelsUnavailable: string; retry: string; loadMore: string; ipCount: string
  ipProfileId: string; primary: string; curationWeight: string; assignIp: string; removeIp: string; success: string; requestFailed: string
}

type Status = 'idle' | 'pending' | 'success' | 'error'
type ListStatus = 'loading' | 'ready' | 'error'

function parseChannelPage(value: unknown): {items: ChannelRecord[]; nextCursor: string | null} {
  return AdminChannelPageSchema.parse(value)
}

async function mutate(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: object): Promise<unknown> {
  const response = await fetch(path, {method, ...body ? {headers: {'content-type': 'application/json'}, body: JSON.stringify(body)} : {}})
  if (!response.ok) throw new Error('REQUEST_FAILED')
  if (response.status === 204) return null
  return response.json()
}

function StatusLine({labels, status}: {labels: AdminChannelsLabels; status: Status}) {
  if (status === 'error') return <p className={styles.error} role="alert">{labels.requestFailed}</p>
  if (status === 'success') return <p aria-live="polite" className={styles.success}>{labels.success}</p>
  return null
}

export function AdminChannels({labels}: {labels: AdminChannelsLabels}) {
  const channelsRef = useRef<ChannelRecord[]>([])
  const selectedIdRef = useRef<string | undefined>(undefined)
  const refreshGenerationRef = useRef(0)
  const mutationPendingRef = useRef(false)
  const [channels, setChannels] = useState<ChannelRecord[]>([])
  const [channel, setChannel] = useState<ChannelRecord>()
  const [listStatus, setListStatus] = useState<ListStatus>('loading')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [paging, setPaging] = useState(false)
  const [createStatus, setCreateStatus] = useState<Status>('idle')
  const [editStatus, setEditStatus] = useState<Status>('idle')
  const [aliases, setAliases] = useState('')
  const [ipProfileId, setIpProfileId] = useState('')
  const [primary, setPrimary] = useState(false)
  const [curationWeight, setCurationWeight] = useState(0)

  const loadChannels = useCallback(async ({cursor}: {cursor?: string} = {}) => {
    if (cursor) setPaging(true)
    else setListStatus('loading')
    try {
      const query = new URLSearchParams({limit: '25'})
      if (cursor) query.set('cursor', cursor)
      const response = await fetch(`/api/admin/channels?${query}`, {method: 'GET'})
      if (!response.ok) throw new Error('REQUEST_FAILED')
      const page = parseChannelPage(await response.json())
      const merged = cursor ? [...channelsRef.current.filter((existing) => !page.items.some((item) => item.id === existing.id)), ...page.items] : page.items
      const selected = merged.find((item) => item.id === selectedIdRef.current) ?? merged[0]
      channelsRef.current = merged
      selectedIdRef.current = selected?.id
      setChannels(merged)
      setChannel(selected)
      setAliases(selected?.aliases.join(', ') ?? '')
      setNextCursor(page.nextCursor)
      setListStatus('ready')
    } catch {setListStatus('error')}
    finally {setPaging(false)}
  }, [])

  const refreshChannel = useCallback(async (channelId: string, select = false) => {
    const generation = ++refreshGenerationRef.current
    const response = await fetch(`/api/admin/channels/${channelId}`, {method: 'GET'})
    if (!response.ok) throw new Error('REQUEST_FAILED')
    const result = ChannelRecordSchema.safeParse(await response.json())
    if (!result.success) throw new Error('INVALID_RESPONSE')
    if (generation !== refreshGenerationRef.current) return
    const exists = channelsRef.current.some((item) => item.id === channelId)
    const updated = exists ? channelsRef.current.map((item) => item.id === channelId ? result.data : item) : [...channelsRef.current, result.data]
    channelsRef.current = updated
    setChannels(updated)
    if (select) selectedIdRef.current = channelId
    if (selectedIdRef.current === channelId) {
      setChannel(result.data)
      setAliases(result.data.aliases.join(', '))
    }
  }, [])

  useEffect(() => {void loadChannels()}, [loadChannels])

  function selectChannel(channelId: string) {
    const selected = channels.find((item) => item.id === channelId)
    selectedIdRef.current = selected?.id
    setChannel(selected)
    setAliases(selected?.aliases.join(', ') ?? '')
    if (!mutationPendingRef.current) setEditStatus('idle')
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreateStatus('pending')
    const data = new FormData(event.currentTarget)
    const parsed = CreateChannelSchema.safeParse({slug: String(data.get('slug') ?? ''), name: String(data.get('name') ?? ''), description: String(data.get('description') ?? ''), sortOrder: Number(data.get('sortOrder') ?? 0)})
    if (!parsed.success) {setCreateStatus('error'); return}
    if (mutationPendingRef.current) return
    mutationPendingRef.current = true
    try {
      const result = ChannelRecordSchema.safeParse(await mutate('/api/admin/channels', 'POST', parsed.data))
      if (!result.success) throw new Error('INVALID_RESPONSE')
      await refreshChannel(result.data.id, true); setCreateStatus('success')
    } catch {setCreateStatus('error')}
    finally {mutationPendingRef.current = false}
  }

  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!channel) return; setEditStatus('pending')
    const data = new FormData(event.currentTarget)
    const parsed = UpdateChannelSchema.safeParse({name: String(data.get('name') ?? ''), description: String(data.get('description') ?? ''), sortOrder: Number(data.get('sortOrder') ?? 0)})
    if (!parsed.success) {setEditStatus('error'); return}
    if (mutationPendingRef.current) return
    mutationPendingRef.current = true
    try {
      const result = ChannelRecordSchema.safeParse(await mutate(`/api/admin/channels/${channel.id}`, 'PATCH', parsed.data))
      if (!result.success) throw new Error('INVALID_RESPONSE')
      await refreshChannel(result.data.id); setEditStatus(selectedIdRef.current === result.data.id ? 'success' : 'idle')
    } catch {setEditStatus(selectedIdRef.current === channel.id ? 'error' : 'idle')}
    finally {mutationPendingRef.current = false}
  }

  async function action(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: object) {
    if (!channel || mutationPendingRef.current) return
    mutationPendingRef.current = true
    setEditStatus('pending')
    try {await mutate(path, method, body); await refreshChannel(channel.id); setEditStatus(selectedIdRef.current === channel.id ? 'success' : 'idle')} catch {setEditStatus(selectedIdRef.current === channel.id ? 'error' : 'idle')}
    finally {mutationPendingRef.current = false}
  }

  const mutationPending = createStatus === 'pending' || editStatus === 'pending'
  return <main className={styles.page}>
    <header><p>AIFANS Admin</p><h1>{labels.title}</h1><span>{labels.description}</span></header>
    <section aria-label={labels.channelList} className={styles.panel}>
      <h2>{labels.channelList}</h2>
      {listStatus === 'loading' ? <p role="status">{labels.loadingChannels}</p> : null}
      {listStatus === 'error' ? <p className={styles.error} role="alert">{labels.channelsUnavailable}</p> : null}
      {listStatus === 'ready' && channels.length ? <label className={styles.form}>{labels.channelList}<select aria-label={labels.channelList} onChange={(event) => selectChannel(event.target.value)} value={channel?.id ?? ''}>{channels.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.status})</option>)}</select></label> : null}
      {listStatus === 'error' ? <button onClick={() => void loadChannels()} type="button">{labels.retry}</button> : null}
      {listStatus === 'ready' && nextCursor ? <button disabled={paging} onClick={() => void loadChannels({cursor: nextCursor})} type="button">{paging ? labels.loadingChannels : labels.loadMore}</button> : null}
    </section>
    <section aria-label={labels.createTitle} className={styles.panel}>
      <h2>{labels.createTitle}</h2>
      <form className={styles.form} onSubmit={(event) => void create(event)}>
        <label>{labels.slug}<input aria-label={labels.slug} name="slug" required /></label>
        <label>{labels.name}<input aria-label={labels.name} name="name" required /></label>
        <label>{labels.channelDescription}<textarea aria-label={labels.channelDescription} name="description" /></label>
        <label>{labels.sortOrder}<input aria-label={labels.sortOrder} defaultValue="0" name="sortOrder" type="number" /></label>
        <button disabled={mutationPending} type="submit">{createStatus === 'pending' ? labels.creating : labels.create}</button>
      </form>
      <StatusLine labels={labels} status={createStatus} />
    </section>
    {channel ? <section aria-label={labels.editTitle} className={styles.panel} key={channel.id}>
      <h2>{labels.editTitle}</h2><p className={styles.id}>{channel.slug} · {channel.status} · {channel.id}</p><p>{channel.ipCount} {labels.ipCount}</p>
      <form className={styles.form} key={`${channel.name}:${channel.description}:${channel.sortOrder}`} onSubmit={(event) => void edit(event)}>
        <label>{labels.name}<input aria-label={labels.name} defaultValue={channel.name} name="name" required /></label>
        <label>{labels.channelDescription}<textarea aria-label={labels.channelDescription} defaultValue={channel.description} name="description" /></label>
        <label>{labels.sortOrder}<input aria-label={labels.sortOrder} defaultValue={channel.sortOrder} name="sortOrder" type="number" /></label>
        <button disabled={mutationPending} type="submit">{editStatus === 'pending' ? labels.saving : labels.save}</button>
      </form>
      <div className={styles.actions}><button disabled={mutationPending} onClick={() => void action(`/api/admin/channels/${channel.id}/publish`, 'POST')} type="button">{labels.publish}</button><button disabled={mutationPending} onClick={() => void action(`/api/admin/channels/${channel.id}/archive`, 'POST')} type="button">{labels.archive}</button></div>
      <div className={styles.form}><label>{labels.aliases}<input aria-label={labels.aliases} onChange={(event) => setAliases(event.target.value)} value={aliases} /></label><p>{labels.aliasesHint}</p><button disabled={mutationPending} onClick={() => void action(`/api/admin/channels/${channel.id}/aliases`, 'PUT', {aliases: aliases.split(',').map((value) => value.trim()).filter(Boolean)})} type="button">{labels.saveAliases}</button></div>
      <div className={styles.form}><label>{labels.ipProfileId}<input aria-label={labels.ipProfileId} onChange={(event) => setIpProfileId(event.target.value)} value={ipProfileId} /></label><label className={styles.check}><input aria-label={labels.primary} checked={primary} onChange={(event) => setPrimary(event.target.checked)} type="checkbox" />{labels.primary}</label><label>{labels.curationWeight}<input aria-label={labels.curationWeight} onChange={(event) => setCurationWeight(Number(event.target.value))} type="number" value={curationWeight} /></label><div className={styles.actions}><button disabled={mutationPending} onClick={() => void action(`/api/admin/channels/${channel.id}/profiles`, 'PUT', {ipProfileId, isPrimary: primary, curationWeight})} type="button">{labels.assignIp}</button><button disabled={mutationPending} onClick={() => void action(`/api/admin/channels/${channel.id}/profiles/${ipProfileId}`, 'DELETE')} type="button">{labels.removeIp}</button></div></div>
      <StatusLine labels={labels} status={editStatus} />
    </section> : null}
  </main>
}
