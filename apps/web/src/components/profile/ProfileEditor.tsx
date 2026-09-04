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
import {Avatar} from '../account/Avatar'
import headerStyles from '../social/PublicProfileContent.module.css'
import {useCurrentAccount} from '../account/CurrentAccountProvider'
import styles from './ProfileEditor.module.css'
import {ProfileEditorMenu} from './ProfileEditorMenu'
import {HumanPreferencesEditor} from './HumanPreferencesEditor'

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
  avatar: string; avatarUpload: string; avatarRemove: string; background: string; backgroundUpload: string; backgroundRemove: string; backgroundCustom?: string
  focalX: string; focalY: string; uploading: string; uploadRetry: string; invalidType: string; invalidSize: string; invalidDimensions: string
  uploadError: string; saveError: string; conflict: string; refetch: string; invalidName: string; invalidUsername: string; unsavedConfirm: string
  colorPaper: string; colorSand: string; colorMist: string; colorSage: string; colorSky: string; colorLilac: string; colorGraphite: string
}

type TextDraft = {displayName: string; username: string; bio: string; preferredLocale: Locale; profileVersion: number; baseAccount: Account}
type UploadState = {status: 'idle'} | {status: 'validating' | 'uploading' | 'failed'; file: File}
type ImageDraft = {type: 'image'; assetId?: string; focalX: number; focalY: number}
type BackgroundEdit = {type: 'color'; colorKey: ProfileBackgroundColorKey} | ImageDraft
type AssetTarget = 'avatar' | 'background'
type UploadOperation = {generation: number; controller: AbortController}

function textDraftFor(account: Account): TextDraft {
  return {displayName: account.displayName, username: account.username, bio: account.bio ?? '', preferredLocale: account.preferredLocale, profileVersion: account.profileVersion, baseAccount: account}
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
  const uploadOperations = useRef<Record<AssetTarget, {generation: number; controller: AbortController | null}>>({
    avatar: {generation: 0, controller: null},
    background: {generation: 0, controller: null},
  })
  const [avatarUpload, setAvatarUpload] = useState<UploadState>({status: 'idle'})
  const [backgroundUpload, setBackgroundUpload] = useState<UploadState>({status: 'idle'})
  const [expanded, setExpanded] = useState<Partial<Record<'displayName' | 'username' | 'bio', boolean>>>({})
  const [assetMenu, setAssetMenu] = useState<'avatar' | 'background' | 'background-image' | null>(null)
  const avatarTrigger = useRef<HTMLButtonElement>(null)
  const backgroundTrigger = useRef<HTMLButtonElement>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const backgroundInput = useRef<HTMLInputElement>(null)
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

  function invalidateUpload(target: AssetTarget) {
    const operation = uploadOperations.current[target]
    operation.generation += 1
    operation.controller?.abort()
    operation.controller = null
    replacePreview(target, null)
  }

  function startUpload(target: AssetTarget, file: File): UploadOperation {
    invalidateUpload(target)
    const operation = uploadOperations.current[target]
    const controller = new AbortController()
    operation.controller = controller
    if (target === 'avatar') {
      setAvatarEdit(undefined)
      setAvatarUpload({status: 'validating', file})
    } else {
      setBackgroundEdit((current) => current?.type === 'image' ? undefined : current)
      setBackgroundUpload({status: 'validating', file})
    }
    return {generation: operation.generation, controller}
  }

  function isCurrentUpload(target: AssetTarget, candidate: UploadOperation): boolean {
    const operation = uploadOperations.current[target]
    return mounted.current && operation.generation === candidate.generation && operation.controller === candidate.controller && !candidate.controller.signal.aborted
  }

  function finishUpload(target: AssetTarget, candidate: UploadOperation) {
    if (isCurrentUpload(target, candidate)) uploadOperations.current[target].controller = null
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const target of ['avatar', 'background'] as const) {
        const operation = uploadOperations.current[target]
        operation.generation += 1
        operation.controller?.abort()
        operation.controller = null
      }
      if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current)
      if (backgroundPreviewRef.current) URL.revokeObjectURL(backgroundPreviewRef.current)
    }
  }, [])

  const uploading = avatarUpload.status === 'validating' || avatarUpload.status === 'uploading' || backgroundUpload.status === 'validating' || backgroundUpload.status === 'uploading'
  const baseAccount = draft?.baseAccount ?? account
  const textDirty = Boolean(baseAccount && draft && (
    draft.displayName !== baseAccount.displayName || draft.username !== baseAccount.username || draft.bio !== (baseAccount.bio ?? '') || draft.preferredLocale !== baseAccount.preferredLocale
  ))
  const avatarDirty = avatarEdit !== undefined && !(avatarEdit === null && !baseAccount?.avatarUrl)
  const backgroundDirty = backgroundEdit !== undefined && (backgroundEdit.type === 'image'
    ? backgroundEdit.assetId !== undefined || baseAccount?.background.type !== 'image' || backgroundEdit.focalX !== baseAccount.background.focalX || backgroundEdit.focalY !== baseAccount.background.focalY
    : baseAccount?.background.type !== 'color' || baseAccount.background.colorKey !== backgroundEdit.colorKey)
  const dirty = textDirty || avatarDirty || backgroundDirty || avatarUpload.status !== 'idle' || backgroundUpload.status !== 'idle'
  const blocked = saving || uploading

  useEffect(() => {
    if (!account) return
    if (draft === null || (!dirty && draft.profileVersion !== account.profileVersion)) resetTo(account)
  }, [account, draft, dirty])

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
    invalidateUpload('avatar')
    invalidateUpload('background')
    setDraft(textDraftFor(next)); setAvatarEdit(undefined); setBackgroundEdit(undefined)
    setAvatarUpload({status: 'idle'}); setBackgroundUpload({status: 'idle'}); setMessage(null); setFieldError(null)
  }

  function leave() {
    if (blocked) return
    if (dirty && !window.confirm(labels.unsavedConfirm)) return
    router.replace(returnTo, {scroll: false})
  }

  async function upload(target: AssetTarget, file: File) {
    const operation = startUpload(target, file)
    setMessage(null)
    const setUpload = target === 'avatar' ? setAvatarUpload : setBackgroundUpload
    if (!isImageType(file.type)) { setUpload({status: 'idle'}); finishUpload(target, operation); setMessage({kind: 'error', text: labels.invalidType}); return }
    if (file.size > MAX_IMAGE_BYTES) { setUpload({status: 'idle'}); finishUpload(target, operation); setMessage({kind: 'error', text: labels.invalidSize}); return }
    let dimensions: {width: number; height: number}
    try { dimensions = await imageDimensions(file) }
    catch {
      if (!isCurrentUpload(target, operation)) return
      setUpload({status: 'idle'}); finishUpload(target, operation); setMessage({kind: 'error', text: labels.invalidDimensions}); return
    }
    if (!isCurrentUpload(target, operation)) return
    if (dimensions.width < MIN_IMAGE_SIDE || dimensions.height < MIN_IMAGE_SIDE || dimensions.width > MAX_IMAGE_SIDE || dimensions.height > MAX_IMAGE_SIDE) {
      setUpload({status: 'idle'}); finishUpload(target, operation); setMessage({kind: 'error', text: labels.invalidDimensions}); return
    }
    replacePreview(target, URL.createObjectURL(file))
    setUpload({status: 'uploading', file})
    try {
      const role: ProfileAssetRole = target
      const intentResponse = await fetch('/api/me/assets/upload-intent', {
        method: 'POST', credentials: 'include', headers: {'content-type': 'application/json'},
        body: JSON.stringify({role, contentType: file.type, sizeBytes: file.size, ...dimensions}),
        signal: operation.controller.signal,
      })
      if (!isCurrentUpload(target, operation)) return
      if (!intentResponse.ok) throw new Error('intent')
      const parsedIntent = ProfileAssetIntentSchema.safeParse(await intentResponse.json())
      if (!isCurrentUpload(target, operation)) return
      if (!parsedIntent.success || parsedIntent.data.maxBytes < file.size) throw new Error('intent')
      const intent = parsedIntent.data
      const putResponse = await fetch(intent.url, {method: 'PUT', headers: intent.headers, body: file, signal: operation.controller.signal})
      if (!isCurrentUpload(target, operation)) return
      if (!putResponse.ok) throw new Error('upload')
      const confirmationResponse = await fetch(`/api/me/assets/${intent.assetId}/confirm`, {
        method: 'POST', credentials: 'include', headers: {'content-type': 'application/json'}, body: JSON.stringify({assetId: intent.assetId}), signal: operation.controller.signal,
      })
      if (!isCurrentUpload(target, operation)) return
      if (!confirmationResponse.ok) throw new Error('confirm')
      const confirmation = ProfileAssetConfirmationResponseSchema.safeParse(await confirmationResponse.json())
      if (!isCurrentUpload(target, operation)) return
      if (!confirmation.success || confirmation.data.assetId !== intent.assetId || confirmation.data.role !== role) throw new Error('confirm')
      if (target === 'avatar') setAvatarEdit(intent.assetId)
      else setBackgroundEdit({type: 'image', assetId: intent.assetId, focalX: 0.5, focalY: 0.5})
      setUpload({status: 'idle'})
      finishUpload(target, operation)
    } catch {
      if (!isCurrentUpload(target, operation)) return
      setUpload({status: 'failed', file})
      finishUpload(target, operation)
      setMessage({kind: 'error', text: labels.uploadError})
    }
  }

  function onFile(target: AssetTarget, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void upload(target, file)
  }

  function selectColor(colorKey: ProfileBackgroundColorKey) {
    invalidateUpload('background')
    setBackgroundUpload({status: 'idle'})
    setBackgroundEdit({type: 'color', colorKey})
    setMessage(null)
  }

  function removeBackgroundImage() {
    const colorKey = baseAccount?.background.type === 'color' ? baseAccount.background.colorKey : 'paper'
    selectColor(colorKey)
  }

  function buildPayload(): UpdateCurrentAccount | null {
    if (!baseAccount || !draft) return null
    const payload: Record<string, unknown> = {profileVersion: draft.profileVersion}
    if (draft.displayName !== baseAccount.displayName) payload.displayName = draft.displayName
    if (draft.username !== baseAccount.username) payload.username = draft.username
    if (draft.bio !== (baseAccount.bio ?? '')) payload.bio = draft.bio.trim() ? draft.bio : null
    if (draft.preferredLocale !== baseAccount.preferredLocale) payload.preferredLocale = draft.preferredLocale
    if (avatarEdit !== undefined) payload.avatarAssetId = avatarEdit
    if (backgroundEdit?.type === 'color') {
      if (baseAccount.background.type !== 'color' || baseAccount.background.colorKey !== backgroundEdit.colorKey) payload.background = backgroundEdit
    } else if (backgroundEdit?.type === 'image') {
      payload.background = {type: 'image', ...(backgroundEdit.assetId ? {backgroundAssetId: backgroundEdit.assetId} : {}), focalX: backgroundEdit.focalX, focalY: backgroundEdit.focalY}
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
  if (!account || !draft || !baseAccount) return <section className={styles.state} role="alert"><p>{labels.authUnavailable}</p><button onClick={() => void refetch()} type="button">{labels.retry}</button></section>

  const activeColor = backgroundEdit?.type === 'color' ? backgroundEdit.colorKey : backgroundEdit ? null : baseAccount.background.type === 'color' ? baseAccount.background.colorKey : null
  const focalX = backgroundEdit?.type === 'image' ? backgroundEdit.focalX : baseAccount.background.type === 'image' ? baseAccount.background.focalX : 0.5
  const focalY = backgroundEdit?.type === 'image' ? backgroundEdit.focalY : baseAccount.background.type === 'image' ? baseAccount.background.focalY : 0.5
  const backgroundImage = backgroundPreview ?? (backgroundEdit?.type === 'color' ? null : baseAccount.background.type === 'image' ? baseAccount.background.url : null)
  const backgroundColor = activeColor ? PROFILE_BACKGROUND_COLORS[activeColor] : PROFILE_BACKGROUND_COLORS.paper
  const previewStyle = {backgroundColor, ...(backgroundImage ? {backgroundImage: `url("${backgroundImage}")`, backgroundPosition: `${focalX * 100}% ${focalY * 100}%`} : {})} satisfies CSSProperties
  const shownAvatar = avatarPreview ?? (avatarEdit === null ? null : baseAccount.avatarUrl)
  const colorKeys = Object.keys(PROFILE_BACKGROUND_COLORS) as ProfileBackgroundColorKey[]
  const toggle = (field: 'displayName' | 'username' | 'bio') => setExpanded((current) => ({...current, [field]: !current[field]}))

  return <div className={styles.page}>
    <header className={`${headerStyles.contextualTitle} ${styles.header}`}>
      <button aria-label={labels.back} className={headerStyles.back} disabled={blocked} onClick={leave} type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg></button>
      <h1>{labels.title}</h1>
      <button className={styles.save} disabled={!dirty || blocked || avatarUpload.status === 'failed' || backgroundUpload.status === 'failed'} form={PROFILE_EDITOR_FORM_ID} type="submit">{saving ? labels.saving : labels.save}</button>
    </header>
    <div className={styles.scroller}>
      <form aria-label={labels.title} className={styles.form} id={PROFILE_EDITOR_FORM_ID} onSubmit={(event) => { event.preventDefault(); void save() }}>
        <section className={styles.row} data-profile-edit-row>
          <button aria-label={labels.avatar} aria-expanded={assetMenu === 'avatar'} aria-haspopup="menu" aria-controls="profile-avatar-menu" ref={avatarTrigger} className={styles.rowTrigger} disabled={saving} onClick={() => setAssetMenu(assetMenu === 'avatar' ? null : 'avatar')} type="button">
            <span className={styles.rowLabel}>{labels.avatar}</span>
            <span className={styles.rowValue}>{avatarPreview ? <span className={styles.avatarPreview}><img alt={labels.avatar} src={avatarPreview}/></span> : <span aria-label={labels.avatar} role="img"><Avatar avatarUrl={shownAvatar} decorative displayName={draft.displayName} size="medium"/></span>}</span>
            <Chevron/>
          </button>
          <input accept={IMAGE_TYPES.join(',')} aria-label={labels.avatarUpload} className="sr-only" disabled={blocked} onChange={(event) => onFile('avatar', event)} ref={avatarInput} tabIndex={-1} type="file"/>
          {avatarUpload.status === 'validating' || avatarUpload.status === 'uploading' ? <p className={styles.uploadStatus} role="status">{labels.uploading}</p> : null}
          {avatarUpload.status === 'failed' ? <div className={styles.controls}><button onClick={() => void upload('avatar', avatarUpload.file)} type="button">{labels.uploadRetry}</button></div> : null}
        </section>

        <section className={styles.row} data-profile-edit-row>
          <button aria-label={labels.background} aria-expanded={assetMenu === 'background' || assetMenu === 'background-image'} aria-haspopup="dialog" aria-controls="profile-background-menu" ref={backgroundTrigger} className={styles.rowTrigger} disabled={saving} onClick={() => setAssetMenu(assetMenu?.startsWith('background') ? null : 'background')} type="button">
            <span className={styles.rowLabel}>{labels.background}</span>
            <span className={styles.rowValue}><span className={styles.backgroundPreview} data-testid="background-preview" style={previewStyle}/></span>
            <Chevron/>
          </button>
          <input accept={IMAGE_TYPES.join(',')} aria-label={labels.backgroundUpload} className="sr-only" disabled={blocked} onChange={(event) => onFile('background', event)} ref={backgroundInput} tabIndex={-1} type="file"/>
          {backgroundUpload.status === 'validating' || backgroundUpload.status === 'uploading' ? <p className={styles.uploadStatus} role="status">{labels.uploading}</p> : null}
          {backgroundUpload.status === 'failed' ? <div className={styles.controls}><button onClick={() => void upload('background', backgroundUpload.file)} type="button">{labels.uploadRetry}</button></div> : null}
        </section>

        {(['displayName', 'username', 'bio'] as const).map((field) => <section className={styles.row} data-profile-edit-row key={field}>
          <button aria-label={labels[field]} aria-controls={`profile-edit-${field}`} aria-expanded={Boolean(expanded[field])} className={styles.rowTrigger} disabled={blocked} onClick={() => toggle(field)} type="button">
            <span className={styles.rowLabel}>{labels[field]}</span><span className={styles.rowValue}>{field === 'username' ? '@' : ''}{draft[field] || '—'}</span><Chevron/>
          </button>
          {expanded[field] ? <div className={styles.controls} id={`profile-edit-${field}`}>
            {field === 'bio' ? <textarea aria-label={labels.bio} autoFocus disabled={blocked} maxLength={500} onChange={(event) => setDraft({...draft, bio: event.target.value})} value={draft.bio}/> : <input aria-label={labels[field]} autoFocus disabled={blocked} maxLength={field === 'displayName' ? 80 : 30} onChange={(event) => setDraft({...draft, [field]: event.target.value})} value={draft[field]}/>}
          </div> : null}
          {field === 'displayName' && fieldError === 'name' ? <p className={styles.fieldError} role="alert">{labels.invalidName}</p> : null}
          {field === 'username' && fieldError === 'username' ? <p className={styles.fieldError} role="alert">{labels.invalidUsername}</p> : null}
        </section>)}
        {message ? <div className={styles.message} role="alert"><p>{message.text}</p>{message.kind === 'conflict' ? <button disabled={blocked} onClick={() => void reloadLatest()} type="button">{labels.refetch}</button> : null}</div> : null}
      </form>
      <HumanPreferencesEditor key={account.id} locale={locale}/>
    </div>
    {assetMenu ? <ProfileEditorMenu anchor={assetMenu === 'avatar' ? avatarTrigger : backgroundTrigger} id={assetMenu === 'avatar' ? 'profile-avatar-menu' : 'profile-background-menu'} key={assetMenu} label={assetMenu === 'avatar' ? labels.avatar : labels.background} onClose={() => setAssetMenu(null)} selector={assetMenu === 'background'}>
      {assetMenu === 'background' ? <>
        <fieldset className={styles.colors}><legend className="sr-only">{labels.background}</legend>{colorKeys.map((key) => <label key={key}><input checked={activeColor === key} disabled={saving} name="profile-background-color" onChange={() => selectColor(key)} type="radio"/><span aria-hidden="true" style={{background: PROFILE_BACKGROUND_COLORS[key]}}/><em>{colorLabel(labels, key)}</em></label>)}</fieldset>
        <button disabled={saving} onClick={() => setAssetMenu('background-image')} type="button"><span>{labels.backgroundCustom ?? (locale === 'zh-CN' ? '自定义图片' : 'Custom image')}</span><span aria-hidden="true" className={styles.backgroundPreview} style={previewStyle}/><Chevron/></button>
      </> : <>
        <button disabled={blocked} onClick={() => { (assetMenu === 'avatar' ? avatarInput : backgroundInput).current?.click(); setAssetMenu(null) }} role="menuitem" type="button">{assetMenu === 'avatar' ? labels.avatarUpload : labels.backgroundUpload}</button>
        <button className={styles.destructive} disabled={saving || (assetMenu === 'avatar' ? !shownAvatar && !baseAccount.avatarUrl : !backgroundImage)} onClick={() => {
          if (assetMenu === 'avatar') { invalidateUpload('avatar'); setAvatarUpload({status: 'idle'}); setAvatarEdit(null) }
          else removeBackgroundImage()
          setAssetMenu(null)
          ;(assetMenu === 'avatar' ? avatarTrigger : backgroundTrigger).current?.focus()
        }} role="menuitem" type="button">{assetMenu === 'avatar' ? labels.avatarRemove : labels.backgroundRemove}</button>
      </>}
    </ProfileEditorMenu> : null}
  </div>
}

function Chevron() {
  return <svg aria-hidden="true" className={styles.chevron} fill="none" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg>
}
