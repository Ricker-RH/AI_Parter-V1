import {describe, expect, it, vi} from 'vitest'
import {createNavigationWarmupScheduler} from './navigation-warmup.js'

function environment(overrides: Partial<Parameters<typeof createNavigationWarmupScheduler>[0]> = {}) {
  return {
    isVisible: () => true,
    isOnline: () => true,
    shouldConserveData: () => false,
    isForegroundIdle: () => true,
    scheduleIdle: (work: () => void) => { queueMicrotask(work); return () => undefined },
    ...overrides,
  }
}

describe('createNavigationWarmupScheduler', () => {
  it('runs one warmup at a time after the entry route is ready', async () => {
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const scheduler = createNavigationWarmupScheduler(environment())

    scheduler.start([
      () => new Promise<void>(resolve => { releaseFirst = () => { order.push('first'); resolve() } }),
      async () => { order.push('second') },
    ])

    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'))
    expect(order).toEqual([])
    releaseFirst?.()
    await vi.waitFor(() => expect(order).toEqual(['first', 'second']))
  })

  it('does not begin background work on hidden, offline, or data-saving devices', async () => {
    for (const overrides of [
      {isVisible: () => false},
      {isOnline: () => false},
      {shouldConserveData: () => true},
    ]) {
      const work = vi.fn(async () => undefined)
      const scheduler = createNavigationWarmupScheduler(environment(overrides))
      scheduler.start([work])
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(work).not.toHaveBeenCalled()
    }
  })

  it('continues with the next read after a failed warmup without surfacing that failure', async () => {
    const next = vi.fn(async () => undefined)
    const scheduler = createNavigationWarmupScheduler(environment())
    scheduler.start([async () => { throw Error('unavailable') }, next])
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce())
  })

  it('does not start queued work after cancellation', async () => {
    let run: (() => void) | undefined
    const work = vi.fn(async () => undefined)
    const scheduler = createNavigationWarmupScheduler(environment({scheduleIdle: callback => { run = callback; return () => undefined }}))
    scheduler.start([work])
    scheduler.cancel()
    run?.()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(work).not.toHaveBeenCalled()
  })

  it('does not let an older queue resume after a newer route starts warming', async () => {
    let releaseFirst: (() => void) | undefined
    const staleSecond = vi.fn(async () => undefined)
    const fresh = vi.fn(async () => undefined)
    const scheduler = createNavigationWarmupScheduler(environment())
    scheduler.start([
      () => new Promise<void>(resolve => { releaseFirst = resolve }),
      staleSecond,
    ])
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'))
    scheduler.start([fresh])
    releaseFirst?.()
    await vi.waitFor(() => expect(fresh).toHaveBeenCalledOnce())
    expect(staleSecond).not.toHaveBeenCalled()
  })
})
