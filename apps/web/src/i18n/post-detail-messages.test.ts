import {describe, expect, it} from 'vitest'
import en from '../../messages/en.json'
import zhCN from '../../messages/zh-CN.json'

describe('post detail locale parity', () => {
  it('keeps the complete top-level English and Chinese message key sets identical', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort())
  })

  it.each([en, zhCN])('provides every global more-menu and report-dialog label', (messages) => {
    for (const key of [
      'appearanceBack', 'reportProblem', 'sessionChecking', 'close',
      'reportProblemTitle', 'reportProblemDescription', 'reportCategory',
      'reportCategoryBug', 'reportCategorySafety', 'reportCategoryOther',
      'reportDetails', 'reportDetailsPlaceholder', 'reportContact',
      'reportContactPlaceholder', 'reportSubmit', 'reportUnavailable',
    ]) expect((messages as Record<string, unknown>)[key]).toBeTruthy()
  })

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
