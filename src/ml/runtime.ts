// Запуск моделей: сессия onnxruntime-web создаётся лениво (динамический импорт), бэкенд WebGPU или WASM в одну нить.
import type { RawKernelSample } from '../app/resources/diagnostics'
import { fromDepth, fromOutput, toInput } from './prepost'
import type { Backend, ModelSpec } from './models'

/** Нужная часть onnxruntime-web: так среду можно подменить в тестах и не тянуть библиотеку, пока ИИ не использован. */
export interface OrtLike {
  env?: {
    webgpu?: {
      profiling?: {
        mode?: 'off' | 'default'
        ondata?: (d: RawKernelSample) => void
      }
    }
  }
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown
  InferenceSession: {
    create(bytes: Uint8Array, options: { executionProviders: string[]; graphOptimizationLevel?: string; externalData?: { path: string; data: Uint8Array }[] }): Promise<SessionLike>
  }
}
export interface SessionLike {
  inputNames: readonly string[]
  outputNames: readonly string[]
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>>
  release?(): Promise<void>
}

export interface RunOptions {
  /** Включить профилирование ядер WebGPU (`env.webgpu.profiling`), только для режима диагностики. */
  profile?: boolean
}

export type Phase = 'session' | 'run'
export interface MlRuntime {
  /** Создаёт сессию модели из байт весов на выбранном бэкенде. */
  /** `data` — внешний файл данных ONNX (у моделей глубины граф и веса лежат отдельно). */
  load(spec: ModelSpec, bytes: ArrayBuffer, backend: Backend, data?: ArrayBuffer): Promise<void>
  /** Альфа 0…1 размера w × h для картинки RGB w × h. */
  matte(spec: ModelSpec, rgb: Uint8Array, w: number, h: number, opts?: RunOptions): Promise<Float32Array>
  /** Карта глубины 0…1 размера w × h для картинки RGB w × h (модель вида depth). */
  depth(spec: ModelSpec, rgb: Uint8Array, w: number, h: number, opts?: RunOptions): Promise<Float32Array>
  release(modelId: string): Promise<void>
  has(modelId: string): boolean
}

export function createRuntime(
  loadOrt: (backend: Backend) => Promise<OrtLike>,
  onPhase?: (phase: Phase, modelId: string) => void,
  onProfile?: (samples: RawKernelSample[], wallMs: number, modelId: string) => void,
): MlRuntime {
  const sessions = new Map<string, SessionLike>()
  const libs = new Map<Backend, OrtLike>()
  const sessionLib = new Map<string, OrtLike>()
  const sessionBackend = new Map<string, Backend>()

  async function exec(spec: ModelSpec, rgb: Uint8Array, w: number, h: number, opts?: RunOptions): Promise<Float32Array> {
    const session = sessions.get(spec.id), ort = sessionLib.get(spec.id), backend = sessionBackend.get(spec.id)
    if (!session || !ort) throw new Error(`session ${spec.id} not loaded`)
    onPhase?.('run', spec.id)
    const prof = Boolean(opts?.profile && backend === 'webgpu' && ort.env?.webgpu)
    const samples: RawKernelSample[] = []
    if (backend === 'webgpu' && ort.env?.webgpu) {
      ort.env.webgpu.profiling = prof
        ? { mode: 'default', ondata: (d) => samples.push({ kernelType: d.kernelType, kernelName: d.kernelName, programName: d.programName, startTime: d.startTime, endTime: d.endTime }) }
        : { mode: 'off' }
    }
    // тензор создаётся заново на каждый запуск: при wasm.proxy ORT забирает буфер
    const input = new ort.Tensor('float32', toInput(rgb, w, h, spec), [1, 3, spec.size, spec.size])
    const t0 = performance.now()
    const out = await session.run({ [session.inputNames[0]]: input })
    const wallMs = Math.max(0, performance.now() - t0)
    if (prof) {
      await new Promise((r) => setTimeout(r, 0))
      if (ort.env?.webgpu) ort.env.webgpu.profiling = { mode: 'off' }
      onProfile?.(samples, wallMs, spec.id)
    }
    return out[session.outputNames[0]].data as Float32Array
  }

  return {
    async load(spec, bytes, backend, data) {
      onPhase?.('session', spec.id)
      // WebGPU-сборка библиотеки ломается без WebGPU даже для WASM-сессии, поэтому у каждого бэкенда своя сборка
      let ort = libs.get(backend)
      if (!ort) { ort = await loadOrt(backend); libs.set(backend, ort) }
      // буфер весов сессии не переиспользуется: ORT может его передать (transfer), поэтому ей отдаём копию
      const session = await ort.InferenceSession.create(new Uint8Array(bytes.slice(0)), { executionProviders: [backend], graphOptimizationLevel: 'all', ...(spec.data && data ? { externalData: [{ path: spec.data.path, data: new Uint8Array(data.slice(0)) }] } : {}) })
      await sessions.get(spec.id)?.release?.()
      sessions.set(spec.id, session); sessionLib.set(spec.id, ort); sessionBackend.set(spec.id, backend)
    },
    async matte(spec, rgb, w, h, opts) {
      return fromOutput(await exec(spec, rgb, w, h, opts), spec, w, h)
    },
    async depth(spec, rgb, w, h, opts) {
      return fromDepth(await exec(spec, rgb, w, h, opts), w, h)
    },
    async release(modelId) { await sessions.get(modelId)?.release?.(); sessions.delete(modelId); sessionLib.delete(modelId); sessionBackend.delete(modelId) },
    has: (modelId) => sessions.has(modelId),
  }
}
