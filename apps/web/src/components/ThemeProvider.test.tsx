import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

const setTheme = vi.fn()
vi.mock('next-themes', () => ({
  ThemeProvider: ({children}: {children: React.ReactNode}) => children,
  useTheme: () => ({theme: 'system', resolvedTheme: 'dark', setTheme}),
}))

import {ThemeControls} from './ThemeProvider.js'

describe('ThemeControls', () => {
  it('selects only the configured theme after mounting', () => {
    render(<ThemeControls dark="Dark" light="Light" system="System" />)

    expect(screen.getByRole('button', {name: 'System'})).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', {name: 'Dark'})).toHaveAttribute('aria-pressed', 'false')
  })

  it('exposes the same theme capability as menu radio items', () => {
    render(<ThemeControls dark="Dark" light="Light" system="System" variant="menu" />)
    expect(screen.getByRole('menuitemradio', {name: 'System'})).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', {name: 'Light'})).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('menuitemradio', {name: 'Dark'}))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })
})

it.each([['鼠尾草绿', 'sage'], ['雾紫', 'lavender'], ['奶油米', 'sand'], ['午夜蓝', 'midnight']])('selects the %s palette from the localized menu', (label, key) => {
  render(<ThemeControls dark="深色" light="浅色" system="跟随系统" locale="zh-CN" variant="menu" />)
  fireEvent.click(screen.getByRole('menuitemradio', {name: label}))
  expect(setTheme).toHaveBeenCalledWith(key)
})
