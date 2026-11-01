import { beforeEach, describe, expect, it } from 'vitest'
import { buildJobReport, clearJobReports, formatBackend, getJobReports, recordJobReport } from './jobs'

describe('resources/jobs', () => {
  beforeEach(() => clearJobReports())

  it('gives busy share 1 for a single-request job and carries provenance on every value', () => {
    const r = buildJobReport({
      kind: 'rebuild',
      start: 100,
      end: 350,
      backend: 'wasm',
      threads: 1,
      triangles: 14200,
    })
    expect(r.durationMs).toEqual({ value: 250, unit: 'ms', source: 'measured' })
    expect(r.busyShare).toEqual({ value: 1, unit: 'ratio', source: 'estimated', note: 'resources.note.busyShare' })
    expect(r.coreEquivalent).toEqual({ value: 1, unit: 'cores', source: 'estimated', note: 'resources.note.coreEquivalent' })
    expect(r.triangles).toEqual({ value: 14200, unit: 'triangles', source: 'measured' })
  })

  it('computes the right busy share for two requests with a gap', () => {
    const r = buildJobReport({
      kind: 'ai',
      name: 'BiRefNet-lite',
      start: 1000,
      end: 2000,
      spans: [
        { start: 1000, end: 1300 },
        { start: 1500, end: 1800 },
      ],
      backend: 'wasm',
      threads: 4,
    })
    expect(r.durationMs.value).toBe(1000)
    expect(r.busyShare.value).toBeCloseTo(0.6, 5)
    expect(r.busyShare.source).toBe('estimated')
    expect(r.coreEquivalent.value).toBeCloseTo(2.4, 5)
    expect(r.coreEquivalent.source).toBe('estimated')
  })

  it('caps the estimated core-equivalent at the thread count', () => {
    const r = buildJobReport({
      kind: 'ai',
      start: 0,
      end: 500,
      spans: [
        { start: 0, end: 400 },
        { start: 200, end: 500 },
      ],
      backend: 'wasm',
      threads: 4,
    })
    expect(r.busyShare.value).toBe(1)
    expect(r.coreEquivalent.value).toBe(4)
  })

  it('reports an unknown backend as such and marks core-equivalent unavailable when threads are unknown', () => {
    const r = buildJobReport({
      kind: 'ai',
      start: 10,
      end: 110,
      backend: 'unknown',
    })
    expect(r.backend).toBe('unknown')
    expect(r.threads).toBe(0)
    expect(r.coreEquivalent).toEqual({
      value: null,
      source: 'unavailable',
      note: 'resources.unavailable.backend',
    })
    expect(formatBackend(r.backend, r.threads)).toBe('unknown')
    expect(formatBackend('wasm', 4)).toBe('WASM ×4')
    expect(formatBackend('webgpu', 1)).toBe('WebGPU')
  })

  it('stores recorded job reports in reverse chronological order', () => {
    recordJobReport({ kind: 'rebuild', start: 0, end: 50, backend: 'wasm', triangles: 100 })
    recordJobReport({ kind: 'ai', name: 'ISNet', start: 60, end: 180, backend: 'webgpu' })
    const list = getJobReports()
    expect(list).toHaveLength(2)
    expect(list[0].kind).toBe('ai')
    expect(list[1].kind).toBe('rebuild')
  })
})
