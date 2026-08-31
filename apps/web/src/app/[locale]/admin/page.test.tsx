import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import en from '../../../../messages/en.json'
import zh from '../../../../messages/zh-CN.json'
import AdminPage from './page.js'

describe('localized operator console page', () => {
  it('keeps complete bilingual admin copy parity', () => {
    expect(Object.keys(en.admin).sort()).toEqual(Object.keys(zh.admin).sort())
    expect(en.admin.authRequired).not.toBe(zh.admin.authRequired)
    expect(en.admin.operatorRequired).not.toBe(zh.admin.operatorRequired)
    expect(en.admin.serviceUnavailable).not.toBe(zh.admin.serviceUnavailable)
  })

  it.each([
    ['en', 'Operator console', 'Authorized operators only. Actions here publish immediately to AIFANS.'],
    ['zh-CN', '运营控制台', '仅限获授权的运营人员。此处操作会立即发布到 AIFANS。'],
  ])('renders the operator-only guidance and all three forms for %s', async (locale, title, guidance) => {
    render(await AdminPage({params: Promise.resolve({locale})}))
    expect(screen.getByRole('heading', {level: 1, name: title})).toBeVisible()
    expect(screen.getByText(guidance)).toBeVisible()
    expect(screen.getAllByRole('region')).toHaveLength(3)
  })
})
