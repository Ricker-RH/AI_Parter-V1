import {describe, expect, it} from 'vitest'
import en from '../../messages/en.json'
import zhCN from '../../messages/zh-CN.json'

describe('post detail locale parity', () => {
  it.each([en, zhCN])('provides the complete contextual header and comments copy', (messages) => {
    expect(messages.back).toBeTruthy()
    expect(messages.postActions).toBeTruthy()
    expect(messages.refresh).toBeTruthy()
    expect(messages.copyLink).toBeTruthy()
    expect(messages.copySuccess).toBeTruthy()
    expect(messages.share).toBeTruthy()
    expect(messages.shareSuccess).toBeTruthy()
    expect(messages.commentsEmptyTitle).toBeTruthy()
    expect(messages.commentsEmptyDescription).toBeTruthy()
  })
})
