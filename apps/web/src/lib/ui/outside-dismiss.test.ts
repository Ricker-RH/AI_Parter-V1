import {expect, it, vi} from 'vitest'
import {fireEvent} from '@testing-library/react'
import {outsideDismiss} from './outside-dismiss'

it('consumes outside press and click before dismissing, then allows the next click', () => {
  const button = document.createElement('button')
  const menu = document.createElement('button')
  document.body.append(button, menu)
  const action = vi.fn(), inside = vi.fn(), close = vi.fn()
  button.addEventListener('click', action)
  menu.addEventListener('click', inside)
  const remove = outsideDismiss(target => menu.contains(target), close)
  fireEvent.click(menu)
  expect(inside).toHaveBeenCalledOnce()
  fireEvent.pointerDown(button)
  fireEvent.mouseDown(button)
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(button)
  expect(close).toHaveBeenCalledOnce()
  expect(action).not.toHaveBeenCalled()
  remove()
  fireEvent.click(button)
  expect(action).toHaveBeenCalledOnce()
  button.remove(); menu.remove()
})
