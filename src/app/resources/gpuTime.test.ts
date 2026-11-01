import { beforeEach, describe, expect, it } from 'vitest'
import { MODELS } from '../../ml/models'
import { createRuntime, type OrtLike } from '../../ml/runtime'
import { aggregateKernels, resetDiagnostics, type RawKernelSample } from './diagnostics'
import { createRenderMonitor, resetRenderSnapshot, type RendererLike } from './render'

describe('resources/diagnostics & WebGPU kernel profiling', () => {
  beforeEach(() => {
    resetDiagnostics()
    resetRenderSnapshot()
  })

  it('aggregates kernel start and end times, computes ratio to wall time, and returns the five slowest kernels', () => {
    const samples: RawKernelSample[] = [
      { kernelType: 'Conv', programName: 'Conv2D_main', startTime: 0, endTime: 12_000_000 },
      { kernelType: 'Conv', programName: 'Conv2D_main', startTime: 12_000_000, endTime: 20_000_000 },
      { kernelType: 'MatMul', programName: 'MatMul_fp16', startTime: 20_000_000, endTime: 35_000_000 },
      { kernelType: 'Add', programName: 'Add_vec4', startTime: 35_000_000, endTime: 37_000_000 },
      { kernelType: 'Softmax', programName: 'Softmax_1', startTime: 37_000_000, endTime: 41_000_000 },
      { kernelType: 'LayerNorm', programName: 'LayerNorm_1', startTime: 41_000_000, endTime: 46_000_000 },
      { kernelType: 'Reshape', programName: 'Reshape_0', startTime: 46_000_000, endTime: 46_500_000 },
    ]
    const prof = aggregateKernels(samples, 60)
    expect(prof.gpuMs).toEqual({ value: 46.5, unit: 'ms', source: 'measured' })
    expect(prof.wallRatio.source).toBe('measured')
    expect(prof.wallRatio.value).toBeCloseTo(46.5 / 60, 5)
    expect(prof.slowest).toHaveLength(5)
    expect(prof.slowest.map((k) => [k.name, k.ms, k.calls])).toEqual([
      ['Conv2D_main', 20, 2],
      ['MatMul_fp16', 15, 1],
      ['LayerNorm_1', 5, 1],
      ['Softmax_1', 4, 1],
      ['Add_vec4', 2, 1],
    ])
  })

  it('keeps ML runtime profiling off unless profile option (diagnostics) is enabled', async () => {
    const spec = { ...MODELS[1], size: 4 }
    const modesDuringRun: string[] = []
    const collected: RawKernelSample[][] = []

    const ort: OrtLike = {
      env: { webgpu: { profiling: { mode: 'off' } } },
      Tensor: class { constructor(public type: string, public data: Float32Array, public dims: number[]) {} } as unknown as OrtLike['Tensor'],
      InferenceSession: {
        async create() {
          return {
            inputNames: ['in'],
            outputNames: ['out'],
            async run() {
              const p = ort.env?.webgpu?.profiling
              modesDuringRun.push(p?.mode ?? 'off')
              if (p?.mode === 'default' && p.ondata) {
                p.ondata({ kernelType: 'Conv', programName: 'Conv_1', startTime: 1000, endTime: 5_001_000 })
              }
              return { out: { data: new Float32Array(16).fill(0.5) } }
            },
          }
        },
      },
    }

    const rt = createRuntime(async () => ort, undefined, (samples) => collected.push(samples))
    await rt.load(spec, new ArrayBuffer(8), 'webgpu')

    await rt.matte(spec, new Uint8Array(12), 2, 2)
    expect(modesDuringRun).toEqual(['off'])
    expect(collected).toHaveLength(0)

    await rt.matte(spec, new Uint8Array(12), 2, 2, { profile: true })
    expect(modesDuringRun).toEqual(['off', 'default'])
    expect(collected).toHaveLength(1)
    expect(collected[0]).toHaveLength(1)
    expect(ort.env?.webgpu?.profiling?.mode).toBe('off')
  })
})

describe('resources/render', () => {
  beforeEach(() => resetRenderSnapshot())

  it('measures triangles, draw calls, submit time, and GPU timer query when diagnostics is on; discards disjoint results', () => {
    let diag = false
    let t = 100
    let disjoint = false
    let available = true
    let elapsedNs = 1_500_000

    const renderer: RendererLike = {
      info: { render: { triangles: 24000, calls: 6 } },
      getContext: () => ({
        QUERY_RESULT: 0x8866,
        QUERY_RESULT_AVAILABLE: 0x8867,
        getExtension: (name) => (name === 'EXT_disjoint_timer_query_webgl2' ? { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb } : null),
        createQuery: () => ({ id: 1 }),
        deleteQuery: () => {},
        beginQuery: () => {},
        endQuery: () => {},
        getQueryParameter: (_q, pname) => (pname === 0x8867 ? available : elapsedNs),
        getParameter: () => disjoint,
      }),
    }

    const mon = createRenderMonitor(renderer, { diagnostics: () => diag, now: () => t })
    expect(mon.timerQuerySupported).toBe(true)

    // Diagnostics off: triangles, calls, submitMs measured, gpuMs unavailable (diagnosticsOff)
    mon.beforeRender()
    t = 101.25
    let snap = mon.afterRender()
    expect(snap.triangles).toEqual({ value: 24000, unit: 'triangles', source: 'measured' })
    expect(snap.drawCalls).toEqual({ value: 6, unit: 'calls', source: 'measured' })
    expect(snap.submitMs).toEqual({ value: 1.25, unit: 'ms', source: 'measured' })
    expect(snap.gpuMs).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.diagnosticsOff' })

    // Diagnostics on, non-disjoint: gpuMs measured
    diag = true
    mon.beforeRender()
    t = 102
    snap = mon.afterRender()
    expect(snap.gpuMs).toEqual({ value: 1.5, unit: 'ms', source: 'measured' })

    // Diagnostics on, disjoint: timer result is discarded
    disjoint = true
    elapsedNs = 999_000_000
    mon.beforeRender()
    t = 103
    snap = mon.afterRender()
    expect(snap.gpuMs).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.timerDisjoint' })
  })

  it('reports unsupported timer query when EXT_disjoint_timer_query_webgl2 is absent', () => {
    const renderer: RendererLike = {
      info: { render: { triangles: 800, calls: 2 } },
      getContext: () => ({
        QUERY_RESULT: 1,
        QUERY_RESULT_AVAILABLE: 2,
        getExtension: () => null,
      }),
    }
    const mon = createRenderMonitor(renderer, { diagnostics: () => true, now: () => 50 })
    expect(mon.timerQuerySupported).toBe(false)
    mon.beforeRender()
    const snap = mon.afterRender()
    expect(snap.triangles.value).toBe(800)
    expect(snap.gpuMs).toEqual({ value: null, source: 'unavailable', note: 'resources.unavailable.timerQuery' })
  })
})
