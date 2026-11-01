import { measured, unavailable, type ResourceValue } from './types'

export type PressureLevel = 'nominal' | 'fair' | 'serious' | 'critical'
export const PRESSURE_LEVELS: readonly PressureLevel[] = ['nominal', 'fair', 'serious', 'critical']

export interface PressureRecordLike {
  state: PressureLevel
}

export interface PressureObserverLike {
  observe(source: 'cpu', opts?: { sampleInterval?: number }): Promise<void> | void
  disconnect(): void
}

export interface PressureObserverCtorLike {
  new (cb: (records: readonly PressureRecordLike[]) => void, opts?: { sampleInterval?: number }): PressureObserverLike
  knownSources?: readonly string[]
}

export interface PressureDeps {
  Observer?: PressureObserverCtorLike
  now?: () => number
}

export interface PressureSnapshot {
  supported: boolean
  running: boolean
  level: ResourceValue<PressureLevel | null>
  timeByLevelMs: ResourceValue<Record<PressureLevel, number> | null>
}

const emptyTimes = (): Record<PressureLevel, number> => ({ nominal: 0, fair: 0, serious: 0, critical: 0 })

export function createPressureCollector(deps: PressureDeps = {}) {
  const Observer = 'Observer' in deps ? deps.Observer : (globalThis as unknown as { PressureObserver?: PressureObserverCtorLike }).PressureObserver
  const now = deps.now ?? (() => performance.now())
  const known = Observer?.knownSources
  let supported = Boolean(Observer && (!known || known.includes('cpu')))

  let observer: PressureObserverLike | null = null
  let currentLevel: PressureLevel | null = null
  let lastChangedAt = 0
  let accum = emptyTimes()

  const flushTo = (t: number) => {
    if (currentLevel && lastChangedAt > 0 && t > lastChangedAt) {
      accum[currentLevel] += t - lastChangedAt
      lastChangedAt = t
    }
  }

  return {
    get supported() { return supported },
    get running() { return observer !== null },

    start() {
      if (!supported || !Observer || observer) return
      lastChangedAt = now()
      observer = new Observer((records) => {
        const last = records[records.length - 1]
        if (!last) return
        const t = now()
        flushTo(t)
        currentLevel = last.state
        lastChangedAt = t
      }, { sampleInterval: 1000 })
      try {
        const res = observer.observe('cpu', { sampleInterval: 1000 })
        if (res && typeof (res as Promise<void>).catch === 'function') {
          ;(res as Promise<void>).catch(() => {
            supported = false
            observer?.disconnect()
            observer = null
          })
        }
      } catch {
        supported = false
        observer.disconnect()
        observer = null
      }
    },

    stop() {
      if (!observer) return
      flushTo(now())
      observer.disconnect()
      observer = null
    },

    reset() {
      accum = emptyTimes()
      lastChangedAt = observer ? now() : 0
    },

    snapshot(): PressureSnapshot {
      if (!supported) {
        return {
          supported: false,
          running: false,
          level: unavailable('resources.unavailable.pressure'),
          timeByLevelMs: unavailable('resources.unavailable.pressure'),
        }
      }
      const copy = { ...accum }
      if (observer && currentLevel && lastChangedAt > 0) {
        const dt = Math.max(0, now() - lastChangedAt)
        copy[currentLevel] += dt
      }
      const lvl: PressureLevel = currentLevel ?? 'nominal'
      return {
        supported: true,
        running: observer !== null,
        level: measured(lvl, undefined, 'resources.note.wholeSystem'),
        timeByLevelMs: measured(copy, 'ms', 'resources.note.wholeSystem'),
      }
    },
  }
}

export type PressureCollector = ReturnType<typeof createPressureCollector>
