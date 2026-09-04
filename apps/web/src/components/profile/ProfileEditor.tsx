'use client'

import {
  AccountSchema,
  ProfileAssetConfirmationResponseSchema,
  ProfileAssetIntentSchema,
  UpdateCurrentAccountSchema,
  type Account,
  type ProfileAssetRole,
  type ProfileBackgroundColorKey,
  type ProfileImageContentType,
  type UpdateCurrentAccount,
} from '@aifans/contracts'
import {useRouter} from 'next/navigation'
import {useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties} from 'react'
import type {Locale} from '../../i18n/config'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import styles from './ProfileEditor.module.css'

export const PROFILE_EDITOR_FORM_ID = 'profile-editor-form'
export const PROFILE_BACKGROUND_COLORS = {
  paper: '#f4f0e8', sand: '#dac7aa', mist: '#cfd7dc', sage: '#b9c8b5', sky: '#b9d5e8', lilac: '#cec2df', graphite: '#454851',
} satisfies Record<ProfileBackgroundColorKey, string>

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_IMAGE_BYTES = 10_485_760
const MIN_IMAGE_SIDE = 64
const MAX_IMAGE_SIDE = 12_000

export type ProfileEditorLabels = {
  title: string; back: string; save: string; saving: string; cancel: string; loading: string; authUnavailable: string; retry: string
  displayName: string; username: string; bio: string; language: string; languageEnglish: string; languageChinese: string
  avatar: string; avatarUpload: string; avatarRemove: string; background: string; backgroundUpload: string; backgroundRemove: string
  focalX: string; focalY: string; uploading: string; uploadRetry: string; invalidType: string; invalidSize: string; invalidDimensions: string
  uploadError: string; saveError: string; conflict: string; refetch: string; invalidName: string; invalidUsername: string; unsavedConfirm: string
  colorPaper: string; colorSand: string; colorMist: string; colorSage: string; colorSky: string; colorLilac: string; colorGraphite: string
}

type TextDraft = {displayName: string; username: string; bio: string; preferredLocale: Locale}
type UploadState = {status: 'idle'} | {status: 'uploading'; file: File} | {status: 'failed'; file: File}
type ImageDraft = {type: 'image'; assetId: string; focalX: number; focalY: number}
type BackgroundEdit = {type: 'color'; colorKey: ProfileBackgroundColorKey} | ImageDraft
type AssetTarget = 'avatar' | 'background'

function textDraftFor(account: Account): TextDraft {
  return {displayName: account.displayName, username: account.username, bio: account.bio ?? '', preferredLocale: account.preferredLocale}
}

export function clampFocalPoint(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

async function imageDimensions(file: File): Promise<{width: number; height: number}> {
  const bitmap = await createImageBitmap(file)
  try { return {width: bitmap.width, height: bitmap.height} }
  finally { bitmap.close() }
}

function isImageType(value: string): value is ProfileImageContentType {
  return IMAGE_TYPES.includes(value as ProfileImageContentType)
}

function colorLabel(labels: ProfileEditorLabels, key: ProfileBackgroundColorKey): string {
  return ({paper: labels.colorPaper, sand: labels.colorSand, mist: labels.colorMist, sage: labels.colorSage, sky: labels.colorSky, lilac: labels.colorLilac, graphite: labels.colorGraphite})[key]
}

export function ProfileEditor({labels, locale, returnTo}: {labels: ProfileEditorLabels; locale: Locale; returnTo: string}) {
  const router = useRouter()
  const {account, loading, refetch, update} = useCurrentAccount()
  const [draft, setDraft] = useState<TextDraft | null>(() => account ? textDraftFor(account) : null)
  const [avatarEdit, setAvatarEdit] = useState<string | null | undefined>(undefined)
  const [backgroundEdit, setBackgroundEdit] = useState<BackgroundEdit | undefined>(undefined)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null)
  const avatarPreviewRef = useRef<string | null>(null)
  const backgroundPreviewRef = useRef<string | null>(null)
  const [avatarUpload, setAvatarUpload] = useState<UploadState>({status: 'idle'})
  const [backgroundUpload, setBackgroundUpload] = useState<UploadState>({status: 'idle'})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{kind: 'error' | 'conflict'; text: string} | null>(null)
  const [fieldError, setFieldError] = useState<'name' | 'username' | null>(null)
  const mounted = useRef(true)

  const replacePreview = useCallback((target: AssetTarget, url: string | null) => {
    const ref = target === 'avatar' ? avatarPreviewRef : backgroundPreviewRef
    if (ref.current) URL.revokeObjectURL(ref.current)
    ref.current = url
    if (target === 'avatar') setAvatarPreview(url)
    else setBackgroundPreview(url)
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current)
      if (backgroundPreviewRef.current) URL.revokeObjectURL(backgroundPreviewRef.current)
    }
  }, [])

  useEffect(() => {
    if (account && draft === null) setDraft(textDraftFor(account))
  }, [account, draft])

  const uploading = avatarUpload.status === 'uploading' || backgroundUpload.status === 'uploading'
  const textDirty = Boolean(account && draft && (
    draft.displayName !== account.displayName || draft.username !== account.username || draft.bio !== (account.bio ?? '') || draft.preferredLocale !== account.preferredLocale
  ))
  const avatarDirty = avatarEdit !== undefined && !(avatarEdit === null && !account?.avatarUrl)
  const backgroundDirty = backgroundEdit !== undefined && (backgroundEdit.type === 'image' || account?.background.type !== 'color' || account.background.colorKey !== backgroundEdit.colorKey)
  const dirty = textDirty || avatarDirty || backgroundDirty || avatarUpload.status !== 'idle' || backgroundUpload.status !== 'idle'
  const blocked = saving || uploading

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  function resetTo(next: Account) {
    replacePreview('avatar', null)
    replacePreview('background', null)
    setDraft(textDraftFor(next)); setAvatarEdit(undefined); setBackgroundEdit(undefined)
    setAvatarUpload({status: 'idle'}); setBackgroundUpload({status: 'idle'}); setMessage(null); setFieldError(null)
  }

  function leave() {
    if (blocked) return
    if (dirty && !window.confirm(labels.unsavedConfirm)) return
    router.replace(returnTo, {scroll: false})
  }

  async function upload(target: AssetTarget, file: File) {
    setMessage(null)
    if (!isImageType(file.type)) { setMessage({kind: 'error', text: labels.invalidType}); return }
    if (file.size > MAX_IMAGE_BYTES) { setMessage({kind: 'error', text: labels.invalidSize}); return }
    let dimensions: {width: number; height: number}
    try { dimensions = await imageDimensions(file) }
    catch { setMessage({kind: 'error', text: labels.invalidDimensions}); return }
    if (dimensions.width < MIN_IMAGE_SIDE || dimensions.height < MIN_IMAGE_SIDE || dimensions.width > MAX_IMAGE_SIDE || dimensions.height > MAX_IMAGE_SIDE) {
      setMessage({kind: 'error', text: labels.invalidDimensions}); return
    }
    if (!mounted.current) return
    replacePreview(target, URL.createObjectURL(file))
    const setUpload = target === 'avatar' ? setAvatarUpload : setBackgroundUpload
    setUpload({status: 'uploading', file})
    try {
      const role: ProfileAssetRole = target
      const intentResponse = await fetch('/api/me/assets/upload-intent', {
        method: 'POST', credentials: 'include', headers: {'content-type': 'application/json'},
        body: JSON.stringify({role, contentType: file.type, sizeBytes: file.size, ...dimensions}),
      })
      if (!intentResponse.ok) throw new Error('intent')
      const parsedIntent = ProfileAssetIntentSchema.safeParse(await intentResponse.json())
      if (!parsedIntent.success || parsedIntent.data.maxBytes < file.size) throw new Error('intent')
      const intent = parsedIntent.data
      const putResponse = await fetch(intent.url, {method: 'PUT', headers: intent.headers, body: file})
      if (!putResponse.ok) throw new Error('upload')
      const confirmationResponse = await fetch(`/api/me/assets/${intent.assetId}/confirm`, {
        method: 'POST', credentials: 'include', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId: intent.assetId}),
      })
      if (!confirmationResponse.ok) throw new Error('confirm')
      const confirmation = ProfileAssetConfirmationResponseSchema.safeParse(await confirmationResponse.json())
      if (!confirmation.success || confirmation.data.assetId !== intent.assetId || confirmation.data.role !== role) throw new Error('confirm')
      if (!mounted.current) return
      if (target === 'avatar') setAvatarEdit(intent.assetId)
      else setBackgroundEdit({type: 'image', assetId: intent.assetId, focalX: 0.5, focalY: 0.5})
      setUpload({status: 'idle'})
    } catch {
      if (!mounted.current) return
      setUpload({status: 'failed', file})
      setMessage({kind: 'error', text: labels.uploadError})
    }
  }

  function onFile(target: AssetTarget, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void upload(target, file)
  }

  function selectColor(colorKey: ProfileBackgroundColorKey) {
    replacePreview('background', null)
    setBackgroundUpload({status: 'idle'})
    setBackgroundEdit({type: 'color', colorKey})
    setMessage(null)
  }

  function removeBackgroundImage() {
    const colorKey = account?.background.type === 'color' ? account.background.colorKey : 'paper'
    selectColor(colorKey)
  }

  function updateFocal(axis: 'focalX' | 'focalY', value: number) {
    setBackgroundEdit((current) => current?.type === 'image' ? {...current, [axis]: clampFocalPoint(value)} : current)
  }

  function buildPayload(): UpdateCurrentAccount | null {
    if (!account || !draft) return null
    const payload: Record<string, unknown> = {profileVersion: account.profileVersion}
    if (draft.displayName !== account.displayName) payload.displayName = draft.displayName
    if (draft.username !== account.username) payload.username = draft.username
    if (draft.bio !== (account.bio ?? '')) payload.bio = draft.bio.trim() ? draft.bio : null
    if (draft.preferredLocale !== account.preferredLocale) payload.preferredLocale = draft.preferredLocale
    if (avatarEdit !== undefined) payload.avatarAssetId = avatarEdit
    if (backgroundEdit?.type === 'color') {
      if (account.background.type !== 'color' || account.background.colorKey !== backgroundEdit.colorKey) payload.background = backgroundEdit
    } else if (backgroundEdit?.type === 'image') {
      payload.background = {type: 'image', backgroundAssetId: backgroundEdit.assetId, focalX: backgroundEdit.focalX, focalY: backgroundEdit.focalY}
    }
    const parsed = UpdateCurrentAccountSchema.safeParse(payload)
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path[0])
      setFieldError(fields.includes('username') ? 'username' : fields.includes('displayName') ? 'name' : null)
      setMessage({kind: 'error', text: labels.saveError})
      return null
    }
    return parsed.data
  }

  async function save() {
    if (blocked) return
    const payload = buildPayload()
    if (!payload) return
    setSaving(true); setMessage(null); setFieldError(null)
    try {
      const response = await fetch('/api/me', {method: 'PATCH', credentials: 'include', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload)})
      if (response.status === 409) { setMessage({kind: 'conflict', text: labels.conflict}); return }
      if (!response.ok) { setMessage({kind: 'error', text: labels.saveError}); return }
      const parsed = AccountSchema.strict().safeParse(await response.json())
      if (!parsed.success || parsed.data.kind !== 'human') { setMessage({kind: 'error', text: labels.saveError}); return }
      update(parsed.data)
      resetTo(parsed.data)
      await Promise.resolve()
      router.replace(returnTo, {scroll: false})
    } catch {
      setMessage({kind: 'error', text: labels.saveError})
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  async function reloadLatest() {
    const latest = await refetch()
    if (latest?.kind === 'human') resetTo(latest)
    else setMessage({kind: 'error', text: labels.saveError})
  }

  if (loading || (account && draft === null)) return <section className={styles.state} role="status">{labels.loading}</section>
  if (!account || !draft) return <section className={styles.state} role="alert"><p>{labels.authUnavailable}</p><button onClick={() => void refetch()} type="button">{labels.retry}</button></section>

  const activeColor = backgroundEdit?.type === 'color' ? backgroundEdit.colorKey : backgroundEdit ? null : account.background.type === 'color' ? account.background.colorKey : null
  const focalX = backgroundEdit?.type === 'image' ? backgroundEdit.focalX : account.background.type === 'image' ? account.background.focalX : 0.5
  const focalY = backgroundEdit?.type === 'image' ? backgroundEdit.focalY : account.background.type === 'image' ? account.background.focalY : 0.5
  const backgroundImage = backgroundPreview ?? (backgroundEdit?.type === 'color' ? null : account.background.type === 'image' ? account.background.url : null)
  const backgroundColor = activeColor ? PROFILE_BACKGROUND_COLORS[activeColor] : PROFILE_BACKGROUND_COLORS.paper
  const previewStyle = {backgroundColor, ...(backgroundImage ? {backgroundImage: `url("${backgroundImage}")`, backgroundPosition: `${focalX * 100}% ${focalY * 100}%`} : {})} satisfies CSSProperties
  const shownAvatar = avatarPreview ?? (avatarEdit === null ? null : account.avatarUrl)
  const colorKeys = Object.keys(PROFILE_BACKGROUND_COLORS) as ProfileBackgroundColorKey[]

  return <div className={styles.page}>
    <header className={styles.header}>
      <button aria-label={labels.back} disabled={blocked} onClick={leave} type="button"><span aria-hidden="true">←</span></button>
      <h1>{labels.title}</h1>
      <button disabled={!dirty || blocked || avatarUpload.status === 'failed' || backgroundUpload.status === 'failed'} form={PROFILE_EDITOR_FORM_ID} type="submit">{saving ? labels.saving : labels.save}</button>
    </header>
    <div className={styles.scroller}>
      <form aria-label={labels.title} className={styles.form} id={PROFILE_EDITOR_FORM_ID} onSubmit={(event) => { event.preventDefault(); void save() }}>
        <section className={styles.section} aria-labelledby="profile-editor-avatar">
          <h2 id="profile-editor-avatar">{labels.avatar}</h2>
          <div className={styles.avatarRow}>
            <div className={styles.avatarPreview}>{shownAvatar ? <img alt={labels.avatar} src={shownAvatar}/> : <span aria-hidden="true">{draft.displayName.slice(0, 1).toUpperCase()}</span>}</div>
            <div className={styles.assetActions}>
              <label className={styles.fileAction}>{labels.avatarUpload}<input accept={IMAGE_TYPES.join(',')} aria-label={labels.avatarUpload} disabled={blocked} onChange={(event) => onFile('avatar', event)} type="file"/></label>
              {(shownAvatar || account.avatarUrl) ? <button disabled={blocked} onClick={() => { replacePreview('avatar', null); setAvatarUpload({status: 'idle'}); setAvatarEdit(null) }} type="button">{labels.avatarRemove}</button> : null}
              {avatarUpload.status === 'uploading' ? <span role="status">{labels.uploading}</span> : null}
              {avatarUpload.status === 'failed' ? <button onClick={() => void upload('avatar', avatarUpload.file)} type="button">{labels.uploadRetry}</button> : null}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="profile-editor-background">
          <h2 id="profile-editor-background">{labels.background}</h2>
          <div className={styles.backgroundPreview} data-testid="background-preview" style={previewStyle}/>
          <div className={styles.assetActions}>
            <label className={styles.fileAction}>{labels.backgroundUpload}<input accept={IMAGE_TYPES.join(',')} aria-label={labels.backgroundUpload} disabled={blocked} onChange={(event) => onFile('background', event)} type="file"/></label>
            {backgroundImage ? <button disabled={blocked} onClick={removeBackgroundImage} type="button">{labels.backgroundRemove}</button> : null}
            {backgroundUpload.status === 'uploading' ? <span role="status">{labels.uploading}</span> : null}
            {backgroundUpload.status === 'failed' ? <button onClick={() => void upload('background', backgroundUpload.file)} type="button">{labels.uploadRetry}</button> : null}
          </div>
          <fieldset className={styles.colors}><legend className="sr-only">{labels.background}</legend>{colorKeys.map((key) => <label key={key}><input checked={activeColor === key} disabled={blocked} name="profile-background-color" onChange={() => selectColor(key)} type="radio"/><span aria-hidden="true" style={{background: PROFILE_BACKGROUND_COLORS[key]}}/><em>{colorLabel(labels, key)}</em></label>)}</fieldset>
          <div className={styles.focalControls}>
            <label>{labels.focalX}<input aria-label={labels.focalX} disabled={blocked || backgroundEdit?.type !== 'image'} max="1" min="0" onChange={(event) => updateFocal('focalX', Number(event.target.value))} step="0.01" type="range" value={focalX}/></label>
            <label>{labels.focalY}<input aria-label={labels.focalY} disabled={blocked || backgroundEdit?.type !== 'image'} max="1" min="0" onChange={(event) => updateFocal('focalY', Number(event.target.value))} step="0.01" type="range" value={focalY}/></label>
          </div>
        </section>

        <section className={styles.section}>
          <label>{labels.displayName}<input aria-label={labels.displayName} disabled={blocked} maxLength={80} onChange={(event) => setDraft({...draft, displayName: event.target.value})} value={draft.displayName}/></label>
          {fieldError === 'name' ? <p role="alert">{labels.invalidName}</p> : null}
          <label>{labels.username}<input aria-label={labels.username} disabled={blocked} maxLength={30} onChange={(event) => setDraft({...draft, username: event.target.value})} value={draft.username}/></label>
          {fieldError === 'username' ? <p role="alert">{labels.invalidUsername}</p> : null}
          <label>{labels.bio}<textarea aria-label={labels.bio} disabled={blocked} maxLength={500} onChange={(event) => setDraft({...draft, bio: event.target.value})} value={draft.bio}/></label>
          <label>{labels.language}<select aria-label={labels.language} disabled={blocked} onChange={(event) => setDraft({...draft, preferredLocale: event.target.value as Locale})} value={draft.preferredLocale}><option value="en">{labels.languageEnglish}</option><option value="zh-CN">{labels.languageChinese}</option></select></label>
        </section>
        {message ? <div className={styles.message} role="alert"><p>{message.text}</p>{message.kind === 'conflict' ? <button disabled={blocked} onClick={() => void reloadLatest()} type="button">{labels.refetch}</button> : null}</div> : null}
        <div className={styles.bottomActions}><button disabled={blocked} onClick={leave} type="button">{labels.cancel}</button></div>
      </form>
    </div>
  </div>
}
