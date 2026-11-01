import { measured, unavailable, type ResourceValue } from './types'

export interface LongTaskEntryLike {
  startTime: number
  duration: number
}

export interface PerformanceObserverLike {
  observe(opts: { type: string; buffered?: boolean }): void
  disconnect(): void
}

export interface PerformanceObserverCtorLike {
  new (cb: (list: { getEntries(): readonly LongTaskEntryLike[] }) => void): PerformanceObserverLike
  supportedEntryTypes?: readonly string[]
}

export interface LongTasksDeps {
  Observer?: PerformanceObserverCtorLike
  now?: () => number
  windowMs?: number
}

export interface LongTasksSnapshot {
  supported: boolean
  running: boolean
  blockedPercent: ResourceValue<number | null>
  longestBlockMs: ResourceValue<number | null>
}

export function createLongTasksCollector(deps: LongTasksDeps = {}) {
  const Observer = 'Observer' in deps ? deps.Observer : (globalThis as unknown as { PerformanceObserver?: PerformanceObserverCtorLike }).PerformanceObserver
  const now = deps.now ?? (() => performance.now())
  const defaultWindowMs = deps.windowMs ?? 10000

  const supportedTypes = Observer?.supportedEntryTypes ?? []
  const entryType = supportedTypes.includes('longtask')
    ? 'longtask'
    : supportedTypes.includes('long-animation-frame')
      ? 'long-animation-frame'
      : null
  const supported = Boolean(Observer && entryType)

  let observer: PerformanceObserverLike | null = null
  const samples: { end: number; duration: number }[] = []

  const prune = (cutoff: number) => {
    while (samples.length > 0 && samples[0].end < cutoff) samples.shift()
  }

  return {
    get supported() { return supported },
    get running() { return observer !== null },

    start() {
      if (!supported || !Observer || !entryType || observer) return
      observer = new Observer((list) => {
        const t = now()
        for (const e of list.getEntries()) {
          if (e.duration > 0) samples.push({ end: t, duration: e.duration })
        }
        prune(t - defaultWindowMs * 2)
      })
      try {
        observer.observe({ type: entryType, buffered: true })
      } catch {
        observer.disconnect()
        observer = null
      }
    },

    stop() {
      if (!observer) return
      observer.disconnect()
      observer = null
    },

    reset() {
      samples.length = 0
    },

    snapshot(windowMs = defaultWindowMs): LongTasksSnapshot {
      if (!supported) {
        return {
          supported: false,
          running: false,
          blockedPercent: unavailable('resources.unavailable.longTasks'),
          longestBlockMs: unavailable('resources.unavailable.longTasks'),
        }
      }
      const cutoff = now() - windowMs
      prune(cutoff)
      let total = 0
      let longest = 0
      for (const s of samples) {
        total += s.duration
        if (s.duration > longest) longest = s.duration
      }
      const pct = windowMs > 0 ? Math.min(100, (total / windowMs) * 100) : 0
      return {
        supported: true,
        running: observer !== null,
        blockedPercent: measured(pct, '%'),
        longestBlockMs: measured(longest, 'ms'),
      }
    },
  }
}

export type LongTasksCollector = ReturnType<typeof createLongTasksCollector>
