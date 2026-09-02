'use client'

import {SearchPageSchema, type PublicIp, type SearchCategory} from '@aifans/contracts'
import Form from 'next/form'
import {useRouter} from 'next/navigation'
import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent} from 'react'
import type {Locale} from '../../i18n/config'
import styles from './SearchComposer.module.css'

type SearchComposerLabels = {
  input: string
  placeholder?: string
  submit: string
  suggestions: string
  searchForQuery?: string
}

type Suggestion = {kind: 'search'; query: string} | {kind: 'profile'; profile: PublicIp}

function searchHref(locale: Locale, query: string) {
  return `/${locale}/search?${new URLSearchParams({q: query})}`
}

export function SearchComposer({category = 'all', initialQuery = '', labels, locale}: {
  category?: SearchCategory
  initialQuery?: string
  labels: SearchComposerLabels
  locale: Locale
}) {
  const router = useRouter()
  const listboxId = useId()
  const requestId = useRef(0)
  const [value, setValue] = useState(initialQuery)
  const [profiles, setProfiles] = useState<PublicIp[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [interacting, setInteracting] = useState(false)
  const normalized = value.trim().replace(/\s+/g, ' ')
  const suggestions = useMemo<Suggestion[]>(() => normalized ? [{kind: 'search', query: normalized}, ...profiles.map((profile) => ({kind: 'profile' as const, profile}))] : [], [normalized, profiles])

  useEffect(() => {
    const currentId = ++requestId.current
    setProfiles([])
    setActiveIndex(-1)
    if (!normalized || !interacting) {setOpen(false); return}
    setOpen(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch(`/api/search/suggestions?${new URLSearchParams({q: normalized})}`, {credentials: 'same-origin', signal: controller.signal})
        .then(async (response) => {
          const parsed = response.ok ? SearchPageSchema.safeParse(await response.json()) : null
          if (controller.signal.aborted || currentId !== requestId.current || !parsed?.success) return
          const unique = new Map<string, PublicIp>()
          for (const item of parsed.data.items) if (item.type === 'profile' && !unique.has(item.profile.id)) unique.set(item.profile.id, item.profile)
          setProfiles([...unique.values()].slice(0, 6))
          setOpen(true)
        })
        .catch(() => undefined)
    }, 250)
    return () => {window.clearTimeout(timer); controller.abort()}
  }, [interacting, normalized])

  function select(suggestion: Suggestion) {
    setOpen(false)
    router.push(suggestion.kind === 'profile' ? `/${locale}/profiles/${suggestion.profile.id}` : searchHref(locale, suggestion.query))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {setOpen(false); setActiveIndex(-1); return}
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => event.key === 'ArrowDown'
        ? current >= suggestions.length - 1 ? 0 : current + 1
        : current <= 0 ? suggestions.length - 1 : current - 1)
      return
    }
    if (event.key === 'Enter' && open && activeIndex >= 0) {
      const suggestion = suggestions[activeIndex]
      if (suggestion) {event.preventDefault(); select(suggestion)}
    }
  }

  const searchFor = (query: string) => (labels.searchForQuery ?? (locale === 'zh-CN' ? '搜索“{query}”' : 'Search for “{query}”')).replace('{query}', query)
  return <Form action={`/${locale}/search`} className={styles.form} role="search">
    <label className="sr-only" htmlFor="search-query">{labels.input}</label>
    <div className={styles.combobox}>
      <div className={styles.field}>
        <svg aria-hidden="true" className={styles.icon} fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>
        <input
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          autoComplete="off"
          id="search-query"
          maxLength={80}
          name="q"
          onChange={(event) => {setInteracting(true); setValue(event.target.value)}}
          onFocus={() => {setInteracting(true); if (suggestions.length) setOpen(true)}}
          onKeyDown={onKeyDown}
          placeholder={labels.placeholder ?? labels.input}
          role="combobox"
          type="search"
          value={value}
        />
        {category !== 'all' ? <input name="category" type="hidden" value={category}/> : null}
        <button aria-label={labels.submit} type="submit"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m8 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></svg></button>
      </div>
      {open && suggestions.length ? <div aria-label={labels.suggestions} className={styles.suggestions} id={listboxId} role="listbox">
        {suggestions.map((suggestion, index) => {
          const name = suggestion.kind === 'search' ? searchFor(suggestion.query) : `${suggestion.profile.displayName} @${suggestion.profile.username}`
          return <button aria-selected={activeIndex === index} className={styles.suggestion} id={`${listboxId}-${index}`} key={suggestion.kind === 'search' ? `search-${suggestion.query}` : suggestion.profile.id} onClick={() => select(suggestion)} role="option" type="button">
            {suggestion.kind === 'profile' ? <span aria-hidden="true" className={styles.avatar}>{suggestion.profile.displayName.slice(0, 1)}</span> : <span aria-hidden="true" className={styles.suggestionIcon}><svg fill="none" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" strokeWidth="1.8"/><path d="m15 15 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg></span>}
            <span>{name}</span>
          </button>
        })}
      </div> : null}
    </div>
  </Form>
}
