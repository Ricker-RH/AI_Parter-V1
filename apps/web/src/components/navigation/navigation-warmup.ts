export type NavigationWarmupTask = () => Promise<void>

export type NavigationWarmupEnvironment = {
  isVisible: () => boolean
  isOnline: () => boolean
  shouldConserveData: () => boolean
  isForegroundIdle: () => boolean
  scheduleIdle: (work: () => void) => () => void
}

function canWarm(environment: NavigationWarmupEnvironment) {
  return environment.isVisible() && environment.isOnline() && !environment.shouldConserveData()
}

export function createNavigationWarmupScheduler(environment: NavigationWarmupEnvironment) {
  let generation = 0
  let cancelIdle: (() => void) | null = null

  const cancel = () => {
    generation += 1
    cancelIdle?.()
    cancelIdle = null
  }

  const start = (tasks: readonly NavigationWarmupTask[]) => {
    cancel()
    const currentGeneration = ++generation
    let nextIndex = 0

    const scheduleNext = () => {
      if (currentGeneration !== generation || nextIndex >= tasks.length || !canWarm(environment)) return
      cancelIdle = environment.scheduleIdle(() => {
        cancelIdle = null
        if (currentGeneration !== generation || !canWarm(environment)) return
        if (!environment.isForegroundIdle()) {
          scheduleNext()
          return
        }
        const task = tasks[nextIndex++]
        void Promise.resolve().then(task).catch(() => undefined).finally(() => {
          if (currentGeneration === generation) scheduleNext()
        })
      })
    }

    scheduleNext()
  }

  return {start, cancel}
}
