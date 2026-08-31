'use client'

import {ThemeProvider as NextThemesProvider, useTheme} from 'next-themes'
import {useEffect, useState, type ReactNode} from 'react'

export function ThemeProvider({children}: {children: ReactNode}) {
  return <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem>{children}</NextThemesProvider>
}

export function ThemeControls({system, light, dark}: {system: string; light: string; dark: string}) {
  const {setTheme, theme} = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const choices = [{key: 'system', label: system}, {key: 'light', label: light}, {key: 'dark', label: dark}] as const
  return <div className="choice-row" aria-label={system}>{choices.map((choice) => <button aria-pressed={mounted && theme === choice.key} className="choice" key={choice.key} onClick={() => setTheme(choice.key)} type="button">{choice.label}</button>)}</div>
}
