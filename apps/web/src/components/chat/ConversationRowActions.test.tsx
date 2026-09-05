import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {expect, it, vi} from 'vitest'
import {ConversationRowActions, conversationTime} from './ConversationRowActions'

it('formats today, yesterday and older years', () => {
  const now = new Date(2026, 8, 5, 12)
  expect(conversationTime(new Date(2026, 8, 4, 9).toISOString(), 'en', now)).toBe('Yesterday')
  expect(conversationTime(new Date(2025, 8, 4).toISOString(), 'en', now)).toContain('2025')
  expect(conversationTime(new Date(2026, 8, 5, 9).toISOString(), 'en', now)).toContain('09:00')
})
it('opens at pointer, pins, and confirms deletion before changing history', async () => {
  const action = vi.fn().mockResolvedValue(undefined)
  render(<ConversationRowActions pinned={false} locale="en" onAction={action}><a href="#chat">Chat</a></ConversationRowActions>)
  fireEvent.contextMenu(screen.getByText('Chat'), {clientX: 80, clientY: 100})
  expect(screen.getByRole('menu')).toHaveStyle({left:'80px',top:'100px'})
  fireEvent.click(screen.getByRole('button', {name:'Pin'}))
  await waitFor(() => expect(action).toHaveBeenCalledWith('pin'))
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  fireEvent.contextMenu(screen.getByText('Chat'))
  fireEvent.click(screen.getByRole('button', {name:'Delete'}))
  expect(action).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', {name:'Delete conversation'}))
  await waitFor(() => expect(action).toHaveBeenCalledWith('delete'))
})
it('keeps confirmation after a failed deletion and closes backdrop without click-through', async () => {
  const clicked = vi.fn()
  render(<div onClick={clicked}><ConversationRowActions pinned locale="en" onAction={vi.fn().mockRejectedValue(Error())}><span>Chat</span></ConversationRowActions></div>)
  fireEvent.contextMenu(screen.getByText('Chat'))
  fireEvent.click(screen.getByRole('button', {name:'Delete'}))
  fireEvent.click(screen.getByRole('button', {name:'Delete conversation'}))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.getByRole('alertdialog')).toBeVisible()
  fireEvent.click(screen.getByRole('alertdialog').parentElement!)
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(clicked).not.toHaveBeenCalled()
})
it('reveals touch actions only for a horizontal swipe', () => {
  render(<ConversationRowActions pinned={false} locale="en" onAction={vi.fn()}><a href="#chat">Chat</a></ConversationRowActions>)
  const row = screen.getByText('Chat').parentElement!
  fireEvent.touchStart(row,{touches:[{clientX:200,clientY:20}]})
  fireEvent.touchEnd(row,{changedTouches:[{clientX:100,clientY:24}]})
  expect(screen.getByRole('button',{name:'Pin'})).toBeVisible()
  fireEvent.click(screen.getByText('Chat'))
  expect(screen.queryByRole('button',{name:'Pin'})).toBeNull()
})
