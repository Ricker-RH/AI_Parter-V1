'use client'

import {ThemeProvider as NextThemesProvider, useTheme} from 'next-themes'
import {useEffect, useState, type ReactNode} from 'react'

export function ThemeProvider({children}: {children: ReactNode}) {
  useEffect(() => {
    const sync = () => {try {document.documentElement.dataset.motion = localStorage.getItem('aifans-motion') === 'reduce' ? 'reduce' : 'system'} catch {}}
    sync(); window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync)
  }, [])
  return <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem enableColorScheme={false} themes={['light', 'dark', 'sage', 'lavender', 'sand', 'midnight']}>{children}</NextThemesProvider>
}

export function ThemeControls({system, light, dark, variant='choices', locale='en'}: {system: string; light: string; dark: string; variant?: 'choices' | 'menu'; locale?: string}) {
  const {setTheme, theme} = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const choices = [{key: 'system', label: system}, {key: 'light', label: light}, {key: 'dark', label: dark}, ...[{key: 'sage', en: 'Sage', zh: '鼠尾草绿'}, {key: 'lavender', en: 'Lavender', zh: '雾紫'}, {key: 'sand', en: 'Sand', zh: '奶油米'}, {key: 'midnight', en: 'Midnight', zh: '午夜蓝'}].map(({key, en, zh}) => ({key, label: locale === 'zh-CN' ? zh : en}))] as const
  if (variant === 'menu') return <div className="global-more-theme-options">{choices.map((choice) => <button aria-checked={mounted && theme === choice.key} className="global-more-theme-option" key={choice.key} onClick={() => setTheme(choice.key)} role="menuitemradio" type="button"><span className="theme-option-label"><span aria-hidden="true" className="theme-swatch" data-palette={choice.key}/>{choice.label}</span><span aria-hidden="true" className="global-more-theme-check">{mounted && theme === choice.key ? '✓' : ''}</span></button>)}</div>
  return <div className="choice-row" aria-label={system}>{choices.map((choice) => <button aria-pressed={mounted && theme === choice.key} className="choice" key={choice.key} onClick={() => setTheme(choice.key)} type="button">{choice.label}</button>)}</div>
}
