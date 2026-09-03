import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

vi.mock('next/navigation', () => ({usePathname: () => '/zh-CN/admin/creator'}))

import {AdminShell} from './AdminShell.js'

describe('AdminShell', () => {
  it('keeps operator navigation inside the isolated admin area', () => {
    render(<AdminShell authConfigured={false} locale="zh-CN"><main>审核队列</main></AdminShell>)

    expect(screen.getAllByRole('link', {name: '内容运营'})[0]).toHaveAttribute('href', '/zh-CN/admin')
    expect(screen.getByRole('link', {name: '频道管理'})).toHaveAttribute('href', '/zh-CN/admin/channels')
    expect(screen.getAllByRole('link', {name: '创作者审核'})[0]).toHaveAttribute('href', '/zh-CN/admin/creator')
    expect(screen.getByRole('link', {name: '返回用户站'})).toHaveAttribute('href', '/zh-CN')
    expect(screen.getAllByRole('link', {name: '创作者审核'})[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('审核队列')).toBeVisible()
    expect(screen.queryByRole('link', {name: '搜索'})).toBeNull()
  })
})
