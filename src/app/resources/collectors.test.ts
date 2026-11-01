import { describe, expect, it } from 'vitest'
import { estimateModelGpuMemory, readGpuInfo } from './gpuInfo'
import { createLongTasksCollector, type LongTaskEntryLike, type PerformanceObserverCtorLike } from './longTasks'
import { readMemorySnapshot } from './memory'
import { createPressureCollector, type PressureObserverCtorLike, type PressureRecordLike } from './pressure'

describe('resources/longTasks', () => {
  it('does not observe before start(), records blocked time and longest block, and disconnects on stop()', () => {
    let observed = 0
    let disconnected = 0
    let push: ((entries: LongTaskEntryLike[]) => void) | null = null
    let t = 1000

    const FakeObserver: PerformanceObserverCtorLike = class {
      static supportedEntryTypes = ['longtask']
      constructor(cb: (list: { getEntries(): readonly LongTaskEntryLike[] }) => void) {
        push = (entries) => cb({ getEntries: () => entries })
      }
      observe() { observed++ }
      disconnect() { disconnected++ }
    }

    const col = createLongTasksCollector({ Observer: FakeObserver, now: () => t, windowMs: 1000 })
    expect(col.supported).toBe(true)
    expect(col.running).toBe(false)
    expect(observed).toBe(0)

    col.start()
    expect(col.running).toBe(true)
    expect(observed).toBe(1)

    t = 1200
    push!([{ startTime: 1100, duration: 80 }, { startTime: 1150, duration: 120 }])

    const snap = col.snapshot(1000)
    expect(snap.blockedPercent).toEqual({ value: 20, unit: '%', source: 'measured' })
    expect(snap.longestBlockMs).toEqual({ value: 120, unit: 'ms', source: 'measured' })

    col.stop()
    expect(col.running).toBe(false)
    expect(disconnected).toBe(1)
  })

  it('returns unavailable when PerformanceObserver or longtask is not supported', () => {
    const col = createLongTasksCollector({ Observer: undefined })
    expect(col.supported).toBe(false)
    col.start()
    expect(col.running).toBe(false)
    const snap = col.snapshot()
    expect(snap.blockedPercent).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.longTasks' })
    expect(snap.longestBlockMs).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.longTasks' })
  })
})

describe('resources/pressure', () => {
  it('does not observe before start(), tracks time per level, and disconnects on stop()', () => {
    let observed = 0
    let disconnected = 0
    let emit: ((recs: PressureRecordLike[]) => void) | null = null
    let t = 0

    const FakePressure: PressureObserverCtorLike = class {
      static knownSources = ['cpu']
      constructor(cb: (records: readonly PressureRecordLike[]) => void) {
        emit = cb
      }
      observe() { observed++ }
      disconnect() { disconnected++ }
    }

    const col = createPressureCollector({ Observer: FakePressure, now: () => t })
    expect(col.supported).toBe(true)
    expect(col.running).toBe(false)
    expect(observed).toBe(0)

    t = 100
    col.start()
    expect(observed).toBe(1)
    expect(col.running).toBe(true)

    emit!([{ state: 'nominal' }])
    t = 500
    emit!([{ state: 'serious' }])
    t = 800

    const snap = col.snapshot()
    expect(snap.level).toEqual({ value: 'serious', source: 'measured', note: 'resources.note.wholeSystem' })
    expect(snap.timeByLevelMs.value).toEqual({ nominal: 400, fair: 0, serious: 300, critical: 0 })

    col.stop()
    expect(col.running).toBe(false)
    expect(disconnected).toBe(1)
  })

  it('returns unavailable when PressureObserver is missing', () => {
    const col = createPressureCollector({ Observer: undefined })
    expect(col.supported).toBe(false)
    col.start()
    expect(col.running).toBe(false)
    const snap = col.snapshot()
    expect(snap.level).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.pressure' })
    expect(snap.timeByLevelMs).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.pressure' })
  })
})

describe('resources/gpuInfo', () => {
  it('reads adapter name, architecture, limits, and timestamp-query support', async () => {
    const info = await readGpuInfo({
      async requestAdapter() {
        return {
          info: { vendor: 'apple', architecture: 'metal-3', description: 'Apple M3 Pro' },
          features: { has: (f) => f === 'timestamp-query' },
          limits: { maxBufferSize: 1073741824 },
        }
      },
    })
    expect(info.supported).toBe(true)
    expect(info.timestampQuery).toBe(true)
    expect(info.adapterName).toEqual({ value: 'Apple M3 Pro', source: 'measured' })
    expect(info.architecture).toEqual({ value: 'metal-3', source: 'measured' })
    expect(info.maxBufferBytes).toEqual({ value: 1073741824, unit: 'B', source: 'measured' })

    const mem = estimateModelGpuMemory({ bytes: 88_000_000, size: 1024 })
    expect(mem.source).toBe('estimated')
    expect(mem.note).toBe('resources.note.gpuMemory')
    expect(mem.value).toBeGreaterThan(88_000_000)
  })

  it('returns unavailable when WebGPU is not supported', async () => {
    const info = await readGpuInfo(undefined)
    expect(info.supported).toBe(false)
    expect(info.adapterName).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.webgpu' })
    expect(info.architecture).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.webgpu' })
  })
})

describe('resources/memory', () => {
  it('reads storage.estimate, performance.memory, model cache size, and wasm memory when supported', async () => {
    const snap = await readMemorySnapshot({
      storage: { estimate: async () => ({ usage: 50_000_000, quota: 2_000_000_000 }) },
      perfMemory: () => ({ usedJSHeapSize: 32_000_000 }),
      modelUsedBytes: () => 45_902_969,
      wasmBytes: () => 16_777_216,
    })
    expect(snap.modelCacheBytes).toEqual({ value: 45_902_969, unit: 'B', source: 'measured' })
    expect(snap.storageUsageBytes).toEqual({ value: 50_000_000, unit: 'B', source: 'measured' })
    expect(snap.storageQuotaBytes).toEqual({ value: 2_000_000_000, unit: 'B', source: 'measured' })
    expect(snap.jsHeapBytes).toEqual({ value: 32_000_000, unit: 'B', source: 'measured' })
    expect(snap.wasmMemoryBytes).toEqual({ value: 16_777_216, unit: 'B', source: 'measured' })
  })

  it('marks unsupported memory sources as unavailable', async () => {
    const snap = await readMemorySnapshot({
      storage: undefined,
      perfMemory: () => undefined,
      modelUsedBytes: () => 0,
      wasmBytes: () => null,
    })
    expect(snap.modelCacheBytes).toEqual({ value: 0, unit: 'B', source: 'measured' })
    expect(snap.storageUsageBytes).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.storageEstimate' })
    expect(snap.storageQuotaBytes).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.storageEstimate' })
    expect(snap.jsHeapBytes).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.jsHeap' })
    expect(snap.wasmMemoryBytes).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.wasmMemory' })
  })
})
